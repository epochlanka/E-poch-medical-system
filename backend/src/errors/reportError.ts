import { classifyError } from './classify';
import { generateErrorId } from './errorId';
import { APP_VERSION, ENVIRONMENT, SERVICE_NAME, writeStructuredError, StructuredErrorEntry } from './logger';
import { evaluateAlert, buildErrorEmail } from './alerts';
import { sendAlertEmail } from './mailer';
import type { Severity } from './AppError';

// The single funnel every error passes through. Called by the global Express error handler and
// by each module's `respondWithServerError` fallback, so behaviour is identical no matter where
// the error surfaced:
//
//   classify -> [unexpected] generate Error ID -> structured log -> deduped admin alert
//            -> return a safe outcome for the caller to send as the HTTP response

export interface ErrorContext {
  module: string;
  endpoint: string;
  method: string;
  userRole: string | null;
  userId: number | string | null;
  requestId: string | null;
}

export interface ReportOutcome {
  errorId: string | null; // null for expected/operational errors
  statusCode: number;
  clientMessage: string;
  severity: Severity;
}

const messageOf = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
};

export const reportError = (err: unknown, ctx: ErrorContext): ReportOutcome => {
  const c = classifyError(err);
  const message = messageOf(err);
  const nowIso = new Date().toISOString();

  const base: StructuredErrorEntry = {
    errorId: null,
    timestamp: nowIso,
    appVersion: APP_VERSION,
    environment: ENVIRONMENT,
    service: SERVICE_NAME,
    severity: c.severity,
    module: ctx.module || 'unknown',
    endpoint: ctx.endpoint,
    method: ctx.method,
    userRole: ctx.userRole,
    userId: ctx.userId,
    requestId: ctx.requestId,
    kind: c.kind,
    message,
  };

  // Expected / user-caused: log for visibility, but no Error ID and no admin email.
  if (c.isOperational) {
    writeStructuredError(base);
    return { errorId: null, statusCode: c.statusCode, clientMessage: c.clientMessage, severity: c.severity };
  }

  // Unexpected / system-level.
  const errorId = generateErrorId();
  const decision = evaluateAlert({ kind: c.kind, module: base.module, message });
  const entry: StructuredErrorEntry = {
    ...base,
    errorId,
    stack: err instanceof Error ? err.stack : undefined,
    occurrenceCount: decision.totalOccurrences,
  };
  writeStructuredError(entry);

  if (decision.send) {
    const mail = buildErrorEmail(entry, decision);
    // fire-and-forget: a slow or failing SMTP must never delay or fail the HTTP response.
    void sendAlertEmail(mail);
  }

  return { errorId, statusCode: c.statusCode >= 500 ? c.statusCode : 500, clientMessage: c.clientMessage, severity: c.severity };
};
