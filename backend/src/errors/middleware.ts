import { Request, Response, NextFunction, RequestHandler } from 'express';
import { reportError, ErrorContext } from './reportError';

const moduleFromRequest = (req: Request): string => {
  const src = req.baseUrl || req.originalUrl || req.path || '';
  const m = src.match(/\/api\/v\d+\/([^/?]+)/);
  if (m) return m[1];
  const seg = (req.path || '/').split('/').filter(Boolean)[0];
  return seg || 'root';
};

const contextFrom = (req: Request, moduleOverride?: string): ErrorContext => {
  const user = req.user as { user_id?: number; role?: string } | undefined;
  return {
    module: moduleOverride || moduleFromRequest(req),
    endpoint: (req.originalUrl || req.url || '').split('?')[0],
    method: req.method,
    userRole: user?.role ?? null,
    userId: user?.user_id ?? null,
    requestId: (req.id != null ? String(req.id) : null) as string | null,
  };
};

const sendSafe = (res: Response, statusCode: number, message: string, errorId: string | null) => {
  if (res.headersSent) return;
  const body: { success: false; message: string; errorId?: string } = { success: false, message };
  if (errorId) body.errorId = errorId;
  res.status(statusCode).json(body);
};

// ---------------------------------------------------------------------------------------------
// Express-level middleware
// ---------------------------------------------------------------------------------------------

/** Wrap an async route/handler so a rejected promise reaches the global error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** 404 for any route that matched no handler. Operational — logged, never emailed. */
export const notFoundHandler: RequestHandler = (req, res) => {
  req.log?.warn({ url: req.originalUrl, method: req.method }, 'Route not found');
  sendSafe(res, 404, 'The requested resource was not found.', null);
};

/** The one global Express error handler. Everything that calls `next(err)` ends up here. */
export const globalErrorHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) return next(err as Error);
  const outcome = reportError(err, contextFrom(req));
  sendSafe(res, outcome.statusCode, outcome.clientMessage, outcome.errorId);
};

// ---------------------------------------------------------------------------------------------
// Adapter for the existing per-module controllers
// ---------------------------------------------------------------------------------------------
// Each module keeps its local `handleError` (which still returns friendly 4xx responses for its
// own typed errors). Only the "unexpected -> 500" branch changes: instead of a bare
// `res.status(500).json({ message: 'Internal Server Error' })`, it calls this so the error gets
// an Error ID, a structured log entry and a deduplicated admin alert — exactly like errors that
// reach the global handler.
export const respondWithServerError = (req: Request, res: Response, err: unknown, moduleName: string): void => {
  const outcome = reportError(err, contextFrom(req, moduleName));
  sendSafe(res, outcome.statusCode, outcome.clientMessage, outcome.errorId);
};
