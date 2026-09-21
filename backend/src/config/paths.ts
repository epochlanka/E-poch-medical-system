import path from 'path';

// Resolved relative to this file (src/config or dist/config -> backend/), never process.cwd().
// Overridable so tests and unusual deployments can point uploads/backups somewhere else — the
// integration tests use a throwaway temp directory rather than writing into the real uploads/.
export const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
export const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(BACKEND_ROOT, 'uploads');
export const BACKUPS_DIR = process.env.BACKUPS_DIR ? path.resolve(process.env.BACKUPS_DIR) : path.join(BACKEND_ROOT, 'backups');
