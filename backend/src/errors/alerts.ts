import type { StructuredErrorEntry } from './logger';

// ---------------------------------------------------------------------------------------------
// Flood protection
// ---------------------------------------------------------------------------------------------
// The same failure (e.g. the DB being down) can hit hundreds of requests a minute. Every
// occurrence is still logged, but the admin gets at most ONE email per distinct error per
// window, and that email carries the occurrence count for the window.

const WINDOW_MS = Number(process.env.ERROR_ALERT_WINDOW_MS || 10 * 60 * 1000); // 10 minutes
const MAX_EMAILS_PER_HOUR = Number(process.env.ERROR_ALERT_MAX_PER_HOUR || 20);

interface Bucket {
  count: number; // occurrences since this bucket was created
  firstSeen: number;
  lastSeen: number;
  lastEmailedAt: number | null;
  countAtLastEmail: number;
}

const buckets = new Map<string, Bucket>();
const emailTimestamps: number[] = []; // rolling 1h window of actually-sent emails

/** Collapses volatile bits (ids, timestamps, ms values, hex) so like errors share a bucket. */
const dedupeKey = (entry: Pick<StructuredErrorEntry, 'kind' | 'module' | 'message'>): string => {
  const normMsg = entry.message
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, '#')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '#uuid')
    .replace(/\d+/g, '#')
    .slice(0, 160);
  return `${entry.kind}|${entry.module}|${normMsg}`;
};

const pruneOld = (now: number) => {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) if (now - b.lastSeen > 24 * 60 * 60 * 1000) buckets.delete(k);
};

export interface AlertDecision {
  key: string;
  send: boolean;
  occurrencesInWindow: number;
  totalOccurrences: number;
  suppressedSinceLastEmail: number;
  reason: 'first-in-window' | 'throttled' | 'hourly-cap';
}

/** Records the occurrence and decides whether this one should trigger an email. */
export const evaluateAlert = (
  entry: Pick<StructuredErrorEntry, 'kind' | 'module' | 'message'>,
  now = Date.now()
): AlertDecision => {
  pruneOld(now);
  const key = dedupeKey(entry);
  const b =
    buckets.get(key) ??
    (() => {
      const fresh: Bucket = { count: 0, firstSeen: now, lastSeen: now, lastEmailedAt: null, countAtLastEmail: 0 };
      buckets.set(key, fresh);
      return fresh;
    })();

  b.count += 1;
  b.lastSeen = now;

  const withinWindow = b.lastEmailedAt !== null && now - b.lastEmailedAt < WINDOW_MS;
  const suppressedSinceLastEmail = b.count - b.countAtLastEmail - 1;

  if (withinWindow) {
    return { key, send: false, occurrencesInWindow: b.count - b.countAtLastEmail, totalOccurrences: b.count, suppressedSinceLastEmail, reason: 'throttled' };
  }

  // Global hourly cap across all distinct errors.
  const hourAgo = now - 60 * 60 * 1000;
  while (emailTimestamps.length && emailTimestamps[0] < hourAgo) emailTimestamps.shift();
  if (emailTimestamps.length >= MAX_EMAILS_PER_HOUR) {
    return { key, send: false, occurrencesInWindow: b.count - b.countAtLastEmail, totalOccurrences: b.count, suppressedSinceLastEmail, reason: 'hourly-cap' };
  }

  emailTimestamps.push(now);
  const occurrencesInWindow = b.count - b.countAtLastEmail;
  b.lastEmailedAt = now;
  b.countAtLastEmail = b.count;
  return { key, send: true, occurrencesInWindow, totalOccurrences: b.count, suppressedSinceLastEmail, reason: 'first-in-window' };
};

// ---------------------------------------------------------------------------------------------
// Email body
// ---------------------------------------------------------------------------------------------

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const buildErrorEmail = (entry: StructuredErrorEntry, decision: AlertDecision) => {
  const subject = `[E-POCH ERROR] ${entry.errorId}`;
  const recurrence =
    decision.totalOccurrences > 1
      ? `\nOccurrences:\n${decision.occurrencesInWindow} in the last alert window (${decision.totalOccurrences} total for this error)\n`
      : '';

  const text = `E-POCH Medical System Error Report

Error ID:
${entry.errorId}

Date & Time:
${fmtDateTime(entry.timestamp)}

Application Version:
${entry.appVersion}

Environment:
${entry.environment}

Severity:
${entry.severity}

Module:
${entry.module}

API:
${entry.method} ${entry.endpoint}

User Role:
${entry.userRole ?? 'Unauthenticated'}

User ID:
${entry.userId ?? 'N/A'}

Request ID:
${entry.requestId ?? 'N/A'}

Error Message:
${entry.message}
${recurrence}
Stack Trace:
${entry.stack ?? '(no stack captured)'}

Service:
${entry.service}
`;

  return { subject, text };
};
