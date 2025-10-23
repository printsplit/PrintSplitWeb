import { Request, Response, NextFunction } from 'express';

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

  // Verify token matches admin password
  if (token !== adminPassword) {
    res.status(403).json({ error: 'Invalid authentication token' });
    return;
  }

  // Authentication successful, proceed to next middleware
  next();
};

/**
 * Login endpoint handler
 * Validates password and returns token
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

  if (password !== adminPassword) {
    res.status(403).json({ error: 'Invalid password' });
    return;
  }

  // Return the token (in a real app, you'd generate a JWT)
  res.json({
    success: true,
    token: adminPassword,
    message: 'Login successful'
  });
};
