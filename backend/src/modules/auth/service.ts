import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AccountLockedError, InvalidCredentialsError, InvalidTotpError, TotpRequiredError, ValidationError } from './errors';
import { buildOtpauthUrl, generateTotpSecret, verifyTotpToken } from './totp';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_EXPIRES_IN, JWT_ISSUER, JWT_SECRET } from '../../config/auth';

const prisma = new PrismaClient();
const FAILED_ATTEMPTS_LIMIT = 5;

interface Actor {
  user_id: number;
  role: string;
  username: string;
}

interface LoginMeta {
  userAgent?: string;
  ipAddress?: string;
}

// FR-004 (lockout) and FR-008 (optional Admin 2FA) both gate here before a session is issued.
// Only a wrong *password* counts toward the lockout counter — a wrong TOTP code rejects that
// attempt without touching it, since the account is already known-correct-password by that point.
export const loginUser = async (username: string, password: string, totpToken: string | undefined, meta: LoginMeta = {}) => {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.is_active) throw new InvalidCredentialsError('Invalid username or password');

  if (user.locked_until && user.locked_until > new Date()) {
    throw new AccountLockedError(`Account is locked until ${user.locked_until.toISOString()} after too many failed login attempts`);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const attempts = user.failed_login_attempts + 1;
    const nowLocked = attempts >= FAILED_ATTEMPTS_LIMIT;

    if (nowLocked) {
      const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
      const lockoutMinutes = settings?.account_lockout_minutes ?? 15;
      await prisma.user.update({
        where: { user_id: user.user_id },
        data: { failed_login_attempts: 0, locked_until: new Date(Date.now() + lockoutMinutes * 60_000) },
      });
      throw new AccountLockedError(`Account locked for ${lockoutMinutes} minutes after ${FAILED_ATTEMPTS_LIMIT} failed login attempts`);
    }

    await prisma.user.update({ where: { user_id: user.user_id }, data: { failed_login_attempts: attempts } });
    throw new InvalidCredentialsError('Invalid username or password');
  }

  if (user.totp_enabled) {
    if (!totpToken) throw new TotpRequiredError('Two-factor authentication code required');
    if (!user.totp_secret || !verifyTotpToken(user.totp_secret, totpToken, user.username)) {
      throw new InvalidTotpError('Invalid authentication code');
    }
  }

  const session = await prisma.userSession.create({
    data: { user_id: user.user_id, user_agent: meta.userAgent, ip_address: meta.ipAddress },
  });
  await prisma.user.update({ where: { user_id: user.user_id }, data: { failed_login_attempts: 0, locked_until: null, last_login_at: new Date() } });

  const payload = { sub: user.user_id, role: user.role, username: user.username, sid: session.session_id };
  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return {
    token,
    user: { id: user.user_id, username: user.username, role: user.role, totpEnabled: user.totp_enabled },
  };
};

export const logoutUser = async (sessionId: number | undefined) => {
  if (!sessionId) return;
  await prisma.userSession.updateMany({ where: { session_id: sessionId, revoked_at: null }, data: { revoked_at: new Date() } });
};

export const changePassword = async (actor: Actor, currentPassword: string, newPassword: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { user_id: actor.user_id } });
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) throw new InvalidCredentialsError('Current password is incorrect');
  if (newPassword.length < 8) throw new ValidationError('New password must be at least 8 characters');

  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { user_id: actor.user_id }, data: { password_hash } });
  // Changing your own password invalidates every other session — a stolen token shouldn't
  // survive a password change.
  await prisma.userSession.updateMany({ where: { user_id: actor.user_id, revoked_at: null }, data: { revoked_at: new Date() } });
};

// ---- Two-Factor Authentication (Admin accounts, FR-008) ------------------------------------

// Secret is stored immediately but totp_enabled stays false until /2fa/verify proves the
// authenticator app is actually in sync with it — otherwise an Admin could lock themselves
// out by enabling 2FA against a secret their app never successfully scanned.
export const setupTotp = async (actor: Actor) => {
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { user_id: actor.user_id }, data: { totp_secret: secret, totp_enabled: false } });
  return { secret, otpauthUrl: buildOtpauthUrl(secret, actor.username) };
};

export const verifyTotpSetup = async (actor: Actor, token: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { user_id: actor.user_id } });
  if (!user.totp_secret) throw new ValidationError('Call /2fa/setup first to generate a secret');
  if (!verifyTotpToken(user.totp_secret, token, user.username)) throw new InvalidTotpError('Invalid authentication code');

  await prisma.user.update({ where: { user_id: actor.user_id }, data: { totp_enabled: true } });
  return { totpEnabled: true };
};

export const disableTotp = async (actor: Actor, password: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { user_id: actor.user_id } });
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new InvalidCredentialsError('Password is incorrect');

  await prisma.user.update({ where: { user_id: actor.user_id }, data: { totp_enabled: false, totp_secret: null } });
  return { totpEnabled: false };
};
