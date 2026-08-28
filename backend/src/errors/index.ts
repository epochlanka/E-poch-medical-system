// Centralized error handling & monitoring — public surface.
//
//   app.ts     -> uses `logger` for pino-http, mounts `healthHandler`, `notFoundHandler`,
//                 `globalErrorHandler`
//   server.ts  -> calls `installProcessErrorHandlers()` and `verifyEmailTransport()`
//   modules/*  -> their local `handleError` calls `respondWithServerError(req, res, err, name)`
//                 for the unexpected/500 branch only
//   new code   -> throw an `AppError` subclass and let the global handler take it

export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
} from './AppError';
export type { Severity } from './AppError';

export { generateErrorId, isErrorId } from './errorId';
export { redactSensitive } from './sanitize';
export { classifyError } from './classify';
export { logger, writeStructuredError, APP_VERSION, ENVIRONMENT, SERVICE_NAME } from './logger';
export type { StructuredErrorEntry } from './logger';
export { reportError } from './reportError';
export type { ErrorContext, ReportOutcome } from './reportError';
export { evaluateAlert, buildErrorEmail } from './alerts';
export { isEmailConfigured, emailStatus, sendAlertEmail, verifyEmailTransport } from './mailer';
export { asyncHandler, notFoundHandler, globalErrorHandler, respondWithServerError } from './middleware';
export { healthHandler, checkDatabase } from './health';
export { installProcessErrorHandlers } from './process';
