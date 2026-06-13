/**
 * Shared request-input validation helpers.
 *
 * Object keys in MinIO are built from client-supplied values, so these guard
 * against path traversal and malformed data reaching the worker.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A bare job id is a UUID (generated server-side). */
export function isValidJobId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * A fileId is the upload object key: `<uuid>/<filename>.stl`.
 * The single `[^/]+` segment forbids extra slashes (and therefore `../`).
 */
export function isValidFileId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+\.stl$/i.test(id)
  );
}

/** A download part name: a single safe filename, no path separators. */
export function isValidPartName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..')
  );
}

/** A piece dimension must be a finite, positive number. */
export function isValidDimension(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value > 0;
}
