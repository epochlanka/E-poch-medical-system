import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError, ValidationError } from './AppError';

// Deliberate-error endpoints for exercising the centralized handler end to end.
//
// DISABLED by default. Only mounted when  ENABLE_ERROR_TEST_ROUTES=true  AND  NODE_ENV!=production
// (see app.ts). Never turn this on in a production deployment.
//
//   GET /api/v1/_diagnostics/health-info      -> plain 200, no error
//   GET /api/v1/_diagnostics/boom?type=...    -> throws, so you can watch the pipeline:
//        type=unhandled  (default) generic thrown Error       -> 500 + Error ID + email
//        type=apperror              AppError (non-operational) -> 500 + Error ID + email
//        type=validation            operational ValidationError-> 400, no Error ID, no email
//        type=db                    real query on a bad client -> 503 + Error ID + email
//        type=async                 rejected promise           -> 500 + Error ID + email

export const diagnosticsRouter = Router();

diagnosticsRouter.get('/health-info', (_req: Request, res: Response) => {
  res.json({ ok: true, note: 'diagnostics routes are enabled — do not run this in production' });
});

diagnosticsRouter.get('/boom', async (req: Request, _res: Response, next: NextFunction) => {
  const type = String(req.query.type || 'unhandled');
  try {
    switch (type) {
      case 'validation':
        throw new ValidationError('Sample validation failure (no alert should be sent)');
      case 'apperror':
        throw new AppError('Sample non-operational AppError', { statusCode: 500, severity: 'ERROR', isOperational: false });
      case 'db': {
        const bad = new PrismaClient({ datasources: { db: { url: 'file:/nonexistent/path/definitely-not-here.db' } } });
        await bad.$queryRaw`SELECT 1`;
        break;
      }
      case 'async':
        await Promise.reject(new Error('Sample rejected promise from an async handler'));
        break;
      case 'unhandled':
      default:
        throw new Error('Sample unhandled exception from a controller');
    }
    next();
  } catch (err) {
    next(err); // hand to the global error handler
  }
});
