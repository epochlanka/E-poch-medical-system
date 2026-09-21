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

// Query-string VALUES are dropped (patient search terms, NICs, phone numbers live there); only
// the parameter names survive, which is enough to debug a request without keeping PHI in logs.
export const sanitizeUrl = (url = ''): string => {
  const [pathname, query] = url.split('?');
  if (!query) return pathname;
  const keys = [...new Set(query.split('&').map((pair) => pair.split('=')[0]).filter(Boolean))];
  return `${pathname}?${keys.map((k) => `${k}=[REDACTED]`).join('&')}`;
};

// Allow-list serializers for pino-http. The default ones dump every request header, the query
// object and EVERY response header — including `Set-Cookie`, i.e. a live session token written
// to the logs on each login. Log only what is needed to trace a request.
export const httpSerializers = {
  req: (req: any) => ({
    id: req.id,
    method: req.method,
    url: sanitizeUrl(req.url),
    remoteAddress: req.remoteAddress ?? req.socket?.remoteAddress,
  }),
  res: (res: any) => ({ statusCode: res.statusCode }),
};

export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: { service: SERVICE_NAME },
  // Second layer behind the allow-list serializers above: even if a serializer is loosened later,
  // credentials in headers still never reach a log line.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["proxy-authorization"]',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
      'res.headers.authorization',
      'password',
      '*.password',
      'token',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
};

export const logger = pino(loggerOptions);

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

// The error log was append-only: on a machine that runs for years it grows until the disk fills,
// taking the whole system down with it. Rotate by size, keep a few generations.
const MAX_LOG_BYTES = 20 * 1024 * 1024;
const KEEP_GENERATIONS = 3;
let approxLogBytes = (() => {
  try {
    return fs.statSync(ERROR_LOG_FILE).size;
  } catch {
    return 0;
  }
})();

const rotateErrorLog = () => {
  try {
    fs.rmSync(`${ERROR_LOG_FILE}.${KEEP_GENERATIONS}`, { force: true });
    for (let i = KEEP_GENERATIONS - 1; i >= 1; i--) {
      if (fs.existsSync(`${ERROR_LOG_FILE}.${i}`)) fs.renameSync(`${ERROR_LOG_FILE}.${i}`, `${ERROR_LOG_FILE}.${i + 1}`);
    }
    fs.renameSync(ERROR_LOG_FILE, `${ERROR_LOG_FILE}.1`);
    approxLogBytes = 0;
  } catch {
    /* never let logging break a request */
  }
};

export const writeStructuredError = (entry: StructuredErrorEntry): void => {
  const safe = redactSensitive(entry);
  if (entry.severity === 'CRITICAL' || entry.severity === 'ERROR') logger.error(safe, `[${entry.kind}] ${entry.message}`);
  else if (entry.severity === 'WARNING') logger.warn(safe, `[${entry.kind}] ${entry.message}`);
  else logger.info(safe, `[${entry.kind}] ${entry.message}`);

  if (fileLoggingReady) {
    try {
      const line = JSON.stringify(safe) + '\n';
      if (approxLogBytes + line.length > MAX_LOG_BYTES) rotateErrorLog();
      approxLogBytes += line.length;
      fs.appendFile(ERROR_LOG_FILE, line, () => undefined);
    } catch {
      /* never let logging break a request */
    }
  }
};
