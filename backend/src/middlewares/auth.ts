import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AUTH_COOKIE_NAME, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET } from '../config/auth';

const prisma = new PrismaClient();

const fromAuthCookie = (req: Request): string | null => {
  const rawCookies = req.headers.cookie;
  if (!rawCookies) return null;

  for (const cookie of rawCookies.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === AUTH_COOKIE_NAME) {
      const value = valueParts.join('=');
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
};

const opts = {
  // Bearer tokens remain supported for non-browser clients while the browser portals use an
  // HttpOnly cookie that cannot be read by injected JavaScript.
  jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), fromAuthCookie]),
  secretOrKey: JWT_SECRET,
  algorithms: [JWT_ALGORITHM],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
};

// Passport JWT strategy — also enforces session-based idle timeout (FR-007) and revocation.
// A JWT's own expiry is a fixed absolute cap; idle timeout has to be checked here per-request
// against UserSession.last_activity_at, since "idle" resets on activity rather than issuance.
passport.use(
  new JwtStrategy(opts, async (jwt_payload, done) => {
    try {
      const userId = Number(jwt_payload.sub);
      const sessionId = Number(jwt_payload.sid);

      // Every access token must be backed by a live server-side session. In particular, do not
      // treat a missing sid as permission to skip revocation and idle-timeout enforcement.
      if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(sessionId) || sessionId <= 0) {
        return done(null, false);
      }

      const session = await prisma.userSession.findUnique({
        where: { session_id: sessionId },
        include: { user: true },
      });

      if (!session || session.revoked_at || session.user_id !== userId || !session.user.is_active) {
        return done(null, false);
      }

      const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
      const timeoutMinutes = settings?.session_timeout_minutes ?? 15;
      const idleMs = Date.now() - session.last_activity_at.getTime();

      if (idleMs > timeoutMinutes * 60_000) {
        await prisma.userSession.update({ where: { session_id: session.session_id }, data: { revoked_at: new Date() } });
        return done(null, false);
      }

      await prisma.userSession.update({ where: { session_id: session.session_id }, data: { last_activity_at: new Date() } });
      const user = { ...session.user, sessionId: session.session_id };

      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  })
);

// Middleware to protect routes
export const requireAuth = passport.authenticate('jwt', { session: false });

// Middleware for RBAC
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any; // Cast to any to access role property, better to define a custom type

    if (!user || !user.role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient privileges' });
    }

    next();
  };
};
