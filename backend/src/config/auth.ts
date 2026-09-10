import dotenv from 'dotenv';
import path from 'path';

// Authentication modules import this file directly, so environment files are loaded before
// any JWT settings are captured. This avoids relying on app.ts's module evaluation order.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MIN_SECRET_LENGTH = 32;
const KNOWN_UNSAFE_SECRETS = new Set([
  'super-secret-jwt-key-replace-in-production',
  'change-me-to-a-long-random-string',
]);

const readJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error('JWT_SECRET is required. Generate a cryptographically random secret before starting the backend.');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
  if (KNOWN_UNSAFE_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET is set to a known unsafe placeholder. Generate a unique cryptographically random secret.');
  }

  return secret;
};

export const JWT_SECRET = readJwtSecret();
export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ISSUER = 'epoch-medical-system';
export const JWT_AUDIENCE = 'epoch-medical-portals';
export const JWT_EXPIRES_IN = '1d';
