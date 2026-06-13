import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Derive a stateless session token from the admin password.
 * The raw password is never sent to the client; the client stores and
 * presents this derived token instead. Changing ADMIN_TOKEN_SECRET (or the
 * password) invalidates previously issued tokens.
 */
function deriveToken(password: string): string {
  const secret = process.env.ADMIN_TOKEN_SECRET || 'printsplit-admin-token';
  return createHash('sha256').update(`${secret}:${password}`).digest('hex');
}

/**
 * Constant-time string comparison to avoid leaking secret length/content
 * via response timing. Inputs are hashed first so timingSafeEqual always
 * receives equal-length buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Simple authentication middleware for admin routes
 * Checks for a valid auth token in the Authorization header
 */
export const authenticateAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Check if admin password is configured
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD not configured in environment variables');
    res.status(500).json({ error: 'Admin authentication not configured' });
    return;
  }

  // Check for Authorization header
  if (!authHeader) {
    res.status(401).json({ error: 'No authorization token provided' });
    return;
  }

  // Extract token from "Bearer <token>" format
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  // Verify token matches the derived admin token (constant-time)
  if (!safeEqual(token, deriveToken(adminPassword))) {
    res.status(403).json({ error: 'Invalid authentication token' });
    return;
  }

  // Authentication successful, proceed to next middleware
  next();
};

/**
 * Login endpoint handler
 * Validates password and returns a derived session token
 */
export const adminLogin = (req: Request, res: Response): void => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: 'Admin authentication not configured' });
    return;
  }

  if (!password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  if (!safeEqual(password, adminPassword)) {
    res.status(403).json({ error: 'Invalid password' });
    return;
  }

  // Return a derived token instead of the raw password so the credential
  // itself never travels in the response body or gets persisted client-side.
  res.json({
    success: true,
    token: deriveToken(adminPassword),
    message: 'Login successful'
  });
};
