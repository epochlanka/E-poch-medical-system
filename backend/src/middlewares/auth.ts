import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
};

// Passport JWT strategy — also enforces session-based idle timeout (FR-007) and revocation.
// A JWT's own expiry is a fixed absolute cap; idle timeout has to be checked here per-request
// against UserSession.last_activity_at, since "idle" resets on activity rather than issuance.
passport.use(
  new JwtStrategy(opts, async (jwt_payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: jwt_payload.sub },
      });

      if (!user || !user.is_active) return done(null, false);

      if (jwt_payload.sid) {
        const session = await prisma.userSession.findUnique({ where: { session_id: jwt_payload.sid } });
        if (!session || session.revoked_at) return done(null, false);

        const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
        const timeoutMinutes = settings?.session_timeout_minutes ?? 15;
        const idleMs = Date.now() - session.last_activity_at.getTime();

        if (idleMs > timeoutMinutes * 60_000) {
          await prisma.userSession.update({ where: { session_id: session.session_id }, data: { revoked_at: new Date() } });
          return done(null, false);
        }

        await prisma.userSession.update({ where: { session_id: session.session_id }, data: { last_activity_at: new Date() } });
        (user as any).sessionId = session.session_id;
      }

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
