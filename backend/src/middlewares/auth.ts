import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
};

// Passport JWT strategy
passport.use(
  new JwtStrategy(opts, async (jwt_payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: jwt_payload.sub },
      });

      if (user && user.is_active) {
        return done(null, user);
      }
      return done(null, false);
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
