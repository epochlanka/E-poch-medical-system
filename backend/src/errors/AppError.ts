// Typed application errors for the centralized error handler.
//
// `isOperational: true`  -> an expected condition (bad input, not found, wrong password…).
//                           Handled, logged at WARNING/INFO, NEVER emailed to the admin.
// `isOperational: false` -> an unexpected/system failure (DB down, bug, crash…).
//                           Gets an Error ID, structured log, and a deduplicated admin alert.
//
// Existing modules keep their own tiny error classes and their local `handleError`; they only
// need to route their 500 fallback through `respondWithServerError` (see ./middleware). New
// code can throw these directly and let the global handler deal with them.

export type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface AppErrorOptions {
  statusCode?: number;
  severity?: Severity;
  isOperational?: boolean;
  /** Safe message to return to the client. Defaults to a generic message for 5xx. */
  clientMessage?: string;
  /** Original error, kept for the log/stack but never sent to the client. */
  cause?: unknown;
  /** Extra non-sensitive context for the structured log. */
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly severity: Severity;
  readonly isOperational: boolean;
  readonly clientMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = opts.statusCode ?? 500;
    this.isOperational = opts.isOperational ?? this.statusCode < 500;
    this.severity = opts.severity ?? (this.statusCode >= 500 ? 'ERROR' : 'WARNING');
    this.clientMessage =
      opts.clientMessage ??
      (this.statusCode >= 500 ? 'Something went wrong. Please try again.' : message);
    this.details = opts.details;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** 400 — malformed or invalid input. Operational, no alert. */
export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: Record<string, unknown>) {
    super(message, { statusCode: 400, severity: 'WARNING', isOperational: true, clientMessage: message, details });
  }
}

/** 401 — not authenticated. Operational, no alert. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, { statusCode: 401, severity: 'INFO', isOperational: true, clientMessage: message });
  }
}

/** 403 — authenticated but not allowed. Operational, no alert. */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, { statusCode: 403, severity: 'INFO', isOperational: true, clientMessage: message });
  }
}

/** 404 — resource does not exist. Operational, no alert. */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, { statusCode: 404, severity: 'INFO', isOperational: true, clientMessage: message });
  }
}

/** 409 — conflict / duplicate. Operational, no alert (a user may duplicate on purpose). */
export class ConflictError extends AppError {
  constructor(message = 'This conflicts with existing data', details?: Record<string, unknown>) {
    super(message, { statusCode: 409, severity: 'WARNING', isOperational: true, clientMessage: message, details });
  }
}

/** 503 — the database is unreachable or timed out. NOT operational -> logged + alerted. */
export class DatabaseError extends AppError {
  constructor(message = 'Database is unavailable', cause?: unknown) {
    super(message, {
      statusCode: 503,
      severity: 'CRITICAL',
      isOperational: false,
      clientMessage: 'Unable to connect to the database. Please try again later.',
      cause,
    });
  }
}

/** 502 — a dependency we call out to failed. NOT operational -> logged + alerted. */
export class ExternalServiceError extends AppError {
  constructor(message = 'An upstream service failed', cause?: unknown) {
    super(message, {
      statusCode: 502,
      severity: 'ERROR',
      isOperational: false,
      clientMessage: 'A dependent service is currently unavailable. Please try again later.',
      cause,
    });
  }
}
