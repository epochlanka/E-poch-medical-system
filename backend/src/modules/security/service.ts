import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

export const ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] as const;
export type Role = (typeof ROLES)[number];

interface Actor {
  user_id: number;
  role: string;
}

const SAFE_USER_SELECT = {
  user_id: true,
  username: true,
  role: true,
  registration_number: true,
  is_active: true,
  totp_enabled: true,
  failed_login_attempts: true,
  locked_until: true,
  last_login_at: true,
} as const;

// ---- Users & Roles (FR-006, BR-10: one login per staff member, one primary role each) ------

export const listUsers = async (includeInactive = false) => {
  return prisma.user.findMany({
    where: includeInactive ? {} : { is_active: true },
    select: SAFE_USER_SELECT,
    orderBy: { username: 'asc' },
  });
};

export const getUserById = async (userId: number) => {
  const user = await prisma.user.findUnique({ where: { user_id: userId }, select: SAFE_USER_SELECT });
  if (!user) throw new NotFoundError('User not found');
  return user;
};

interface CreateUserInput {
  username: string;
  password: string;
  role: string;
  registration_number?: string;
}

export const createUser = async (input: CreateUserInput, actor: Actor) => {
  if (!ROLES.includes(input.role as Role)) throw new ValidationError(`role must be one of ${ROLES.join(', ')}`);
  if (input.password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new ValidationError('Username is already taken');

  const password_hash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { username: input.username, password_hash, role: input.role, registration_number: input.registration_number },
    select: SAFE_USER_SELECT,
  });

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'CREATE', entity: 'User', entity_id: String(user.user_id) } });
  return user;
};

interface UpdateUserInput {
  role?: string;
  is_active?: boolean;
  registration_number?: string;
}

export const updateUser = async (userId: number, updates: UpdateUserInput, actor: Actor) => {
  const existing = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!existing) throw new NotFoundError('User not found');

  if (updates.role !== undefined && !ROLES.includes(updates.role as Role)) {
    throw new ValidationError(`role must be one of ${ROLES.join(', ')}`);
  }
  if (updates.is_active === false && userId === actor.user_id) {
    throw new ValidationError('You cannot deactivate your own account');
  }

  const user = await prisma.user.update({ where: { user_id: userId }, data: updates, select: SAFE_USER_SELECT });

  if (updates.is_active === false) {
    await prisma.userSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'UPDATE', entity: 'User', entity_id: String(userId) } });
  return user;
};

export const resetPassword = async (userId: number, newPassword: string, actor: Actor) => {
  const existing = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!existing) throw new NotFoundError('User not found');
  if (newPassword.length < 8) throw new ValidationError('Password must be at least 8 characters');

  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { user_id: userId }, data: { password_hash, failed_login_attempts: 0, locked_until: null } });
  // The old password is now void everywhere it was still logged in.
  await prisma.userSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } });

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'RESET_PASSWORD', entity: 'User', entity_id: String(userId) } });
  return getUserById(userId);
};

export const unlockUser = async (userId: number, actor: Actor) => {
  const existing = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!existing) throw new NotFoundError('User not found');

  const user = await prisma.user.update({
    where: { user_id: userId },
    data: { failed_login_attempts: 0, locked_until: null },
    select: SAFE_USER_SELECT,
  });

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'UNLOCK', entity: 'User', entity_id: String(userId) } });
  return user;
};

// ---- Session Management (FR-007) -------------------------------------------------------------

// A session can be idle-expired in substance (last_activity_at past the timeout) without
// revoked_at being set yet, since that flag is only written lazily the next time that exact
// session makes an authenticated request. "Active" here means both checks, not just the flag.
export const listActiveSessions = async () => {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  const timeoutMinutes = settings?.session_timeout_minutes ?? 15;
  const cutoff = new Date(Date.now() - timeoutMinutes * 60_000);

  const sessions = await prisma.userSession.findMany({
    where: { revoked_at: null, last_activity_at: { gte: cutoff } },
    include: { user: { select: { user_id: true, username: true, role: true } } },
    orderBy: { last_activity_at: 'desc' },
  });

  return sessions.map((s) => ({
    sessionId: s.session_id,
    userId: s.user.user_id,
    username: s.user.username,
    role: s.user.role,
    createdAt: s.created_at,
    lastActivityAt: s.last_activity_at,
    userAgent: s.user_agent,
    ipAddress: s.ip_address,
  }));
};

export const revokeSession = async (sessionId: number, actor: Actor) => {
  const session = await prisma.userSession.findUnique({ where: { session_id: sessionId } });
  if (!session) throw new NotFoundError('Session not found');
  if (!session.revoked_at) {
    await prisma.userSession.update({ where: { session_id: sessionId }, data: { revoked_at: new Date() } });
    await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'REVOKE', entity: 'UserSession', entity_id: String(sessionId) } });
  }
};
