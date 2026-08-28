import { TOTP, Secret } from 'otpauth';

const ISSUER = 'E-Poch Medical System';

export const generateTotpSecret = (): string => new Secret({ size: 20 }).base32;

const buildTotp = (secret: string, username: string) =>
  new TOTP({ issuer: ISSUER, label: username, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) });

export const buildOtpauthUrl = (secret: string, username: string): string => buildTotp(secret, username).toString();

// window: 1 tolerates the code from one 30s step before/after now, for clock drift.
export const verifyTotpToken = (secret: string, token: string, username = 'user'): boolean =>
  buildTotp(secret, username).validate({ token, window: 1 }) !== null;
