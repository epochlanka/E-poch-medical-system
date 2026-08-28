import { Prisma } from '@prisma/client';
import { AppError, Severity } from './AppError';

// Normalizes anything that was thrown into a decision the reporter can act on.
//
//  - `isOperational`  -> expected; log at WARNING/INFO, no admin email, no Error ID.
//  - `!isOperational` -> unexpected/system; Error ID + structured log + (deduped) admin email.

export interface Classification {
  statusCode: number;
  severity: Severity;
  isOperational: boolean;
  /** Safe, user-facing message. Never contains internals. */
  clientMessage: string;
  /** Short label for the log / email, e.g. "DatabaseConnectionError", "ZodValidationError". */
  kind: string;
}

const GENERIC_5XX = 'Something went wrong. Please try again.';
const DB_DOWN = 'Unable to connect to the database. Please try again later.';

// Prisma engine codes that mean "cannot reach / talk to the database".
const DB_CONNECTIVITY_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1010', 'P1011', 'P1017']);

const asRecord = (e: unknown): Record<string, unknown> =>
  e && typeof e === 'object' ? (e as Record<string, unknown>) : {};

export const classifyError = (err: unknown): Classification => {
  // 1. Our own typed errors — already carry the decision.
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      severity: err.severity,
      isOperational: err.isOperational,
      clientMessage: err.clientMessage,
      kind: err.name,
    };
  }

  // 2. Prisma: initialization / connectivity failures => database is down (CRITICAL).
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && DB_CONNECTIVITY_CODES.has(err.code))
  ) {
    return { statusCode: 503, severity: 'CRITICAL', isOperational: false, clientMessage: DB_DOWN, kind: 'DatabaseConnectionError' };
  }

  // 3. Prisma: a known request error that maps to a normal user-facing outcome.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return { statusCode: 409, severity: 'WARNING', isOperational: true, clientMessage: 'A record with these details already exists.', kind: 'UniqueConstraintViolation' };
      case 'P2025':
        return { statusCode: 404, severity: 'INFO', isOperational: true, clientMessage: 'The requested record was not found.', kind: 'RecordNotFound' };
      case 'P2003':
        return { statusCode: 409, severity: 'WARNING', isOperational: true, clientMessage: 'This record is referenced by other data and cannot be changed.', kind: 'ForeignKeyViolation' };
      default:
        return { statusCode: 500, severity: 'ERROR', isOperational: false, clientMessage: GENERIC_5XX, kind: `PrismaError_${err.code}` };
    }
  }

  // 4. Prisma: panics / bad queries are bugs.
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return { statusCode: 500, severity: 'CRITICAL', isOperational: false, clientMessage: GENERIC_5XX, kind: 'PrismaRustPanic' };
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 500, severity: 'ERROR', isOperational: false, clientMessage: GENERIC_5XX, kind: 'PrismaValidationError' };
  }

  const rec = asRecord(err);
  const name = typeof rec.name === 'string' ? rec.name : '';
  const status = Number(rec.status ?? rec.statusCode);

  // 5. Zod (used by the validate middleware, but may also bubble up raw).
  if (name === 'ZodError' || Array.isArray(rec.issues)) {
    return { statusCode: 400, severity: 'WARNING', isOperational: true, clientMessage: 'Some of the submitted values are invalid.', kind: 'ZodValidationError' };
  }

  // 6. body-parser / express.json on a malformed request body.
  if (name === 'SyntaxError' && (rec.type === 'entity.parse.failed' || 'body' in rec)) {
    return { statusCode: 400, severity: 'WARNING', isOperational: true, clientMessage: 'The request body could not be parsed.', kind: 'MalformedRequestBody' };
  }

  // 7. Multer upload errors carry a `code` like LIMIT_FILE_SIZE.
  if (name === 'MulterError') {
    return { statusCode: 400, severity: 'WARNING', isOperational: true, clientMessage: (rec.message as string) || 'File upload failed.', kind: `MulterError_${rec.code ?? 'UNKNOWN'}` };
  }

  // 8. Anything else that already declared a 4xx status is treated as operational.
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return {
      statusCode: status,
      severity: status === 401 || status === 403 || status === 404 ? 'INFO' : 'WARNING',
      isOperational: true,
      clientMessage: typeof rec.message === 'string' && rec.message ? rec.message : 'Request could not be completed.',
      kind: name || 'ClientError',
    };
  }

  // 9. Fallback: an unexpected server-side failure.
  return {
    statusCode: Number.isFinite(status) && status >= 500 ? status : 500,
    severity: 'ERROR',
    isOperational: false,
    clientMessage: GENERIC_5XX,
    kind: name || 'UnhandledException',
  };
};
