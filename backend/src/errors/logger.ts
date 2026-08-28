import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { redactSensitive } from './sanitize';
import type { Severity } from './AppError';

// One shared pino instance for the whole app. `app.ts` passes this into `pino-http`, so request
// logs and error logs share the same stream/format (the "existing project logging approach").

export const APP_VERSION = process.env.APP_VERSION || readPackageVersion();
export const ENVIRONMENT = process.env.NODE_ENV || 'development';
export const SERVICE_NAME = process.env.SERVICE_NAME || 'epoch-backend';

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: SERVICE_NAME },
  // pino already redacts by path; our own redactSensitive() handles nested/unknown shapes before
  // anything reaches here, but keep a cheap top-level guard too.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password', 'token', '*.token'],
    censor: '[REDACTED]',
  },
});

export interface StructuredErrorEntry {
  errorId: string | null;
  timestamp: string;
  appVersion: string;
  environment: string;
  service: string;
  severity: Severity;
  module: string;
  endpoint: string;
  method: string;
  userRole: string | null;
  userId: number | string | null;
  requestId: string | null;
  kind: string;
  message: string;
  stack?: string;
  occurrenceCount?: number;
  details?: Record<string, unknown>;
}

// A gitignored newline-delimited JSON file so an admin can `grep ERR-20260828-000125 logs/errors.log`.
const ERROR_LOG_FILE = process.env.ERROR_LOG_FILE || path.join(__dirname, '..', '..', 'logs', 'errors.log');
let fileLoggingReady = false;
try {
  fs.mkdirSync(path.dirname(ERROR_LOG_FILE), { recursive: true });
  fileLoggingReady = true;
} catch {
  fileLoggingReady = false;
}

export const writeStructuredError = (entry: StructuredErrorEntry): void => {
  const safe = redactSensitive(entry);
  if (entry.severity === 'CRITICAL' || entry.severity === 'ERROR') logger.error(safe, `[${entry.kind}] ${entry.message}`);
  else if (entry.severity === 'WARNING') logger.warn(safe, `[${entry.kind}] ${entry.message}`);
  else logger.info(safe, `[${entry.kind}] ${entry.message}`);

  if (fileLoggingReady) {
    try {
      fs.appendFile(ERROR_LOG_FILE, JSON.stringify(safe) + '\n', () => undefined);
    } catch {
      /* never let logging break a request */
    }
  }
};
