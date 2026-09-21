// Enable the deliberate-error routes BEFORE app.ts is evaluated.
process.env.ENABLE_ERROR_TEST_ROUTES = 'true';
process.env.NODE_ENV = 'test';

import request from 'supertest';
import { generateErrorId, isErrorId } from './errorId';
import { redactSensitive } from './sanitize';
import { classifyError } from './classify';
import { evaluateAlert, buildErrorEmail } from './alerts';
import { AppError, ValidationError as AppValidationError } from './AppError';
import type { StructuredErrorEntry } from './logger';

// app has side effects (dotenv, prisma) — require it only after env is set.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../app').default;

describe('Error handling — units', () => {
  it('generates unique, well-formed, incrementing Error IDs', () => {
    const now = new Date('2026-08-28T22:15:00Z');
    const a = generateErrorId(now);
    const b = generateErrorId(now);
    expect(a).toMatch(/^ERR-\d{8}-\d{6}$/);
    expect(isErrorId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(Number(b.slice(-6))).toBe(Number(a.slice(-6)) + 1);
    expect(isErrorId('not-an-id')).toBe(false);
  });

  it('redacts credentials and secret-looking values before logging', () => {
    const input = {
      email: 'user@example.com',
      password: 'hunter2',
      password_hash: '$2b$10$abcdef',
      nested: { refreshToken: 'rt_123', apiKey: 'sk-live-xyz', ok: 'keep-me' },
      headers: { authorization: 'Bearer eyJhbGciOi.J.abc', 'content-type': 'application/json' },
      note: 'connect to postgres://admin:pw@db:5432/app failed',
      DATABASE_URL: 'file:./dev.db',
    };
    const out = redactSensitive(input) as any;
    expect(out.email).toBe('user@example.com');
    expect(out.password).toBe('[REDACTED]');
    expect(out.password_hash).toBe('[REDACTED]');
    expect(out.nested.refreshToken).toBe('[REDACTED]');
    expect(out.nested.apiKey).toBe('[REDACTED]');
    expect(out.nested.ok).toBe('keep-me');
    expect(out.headers.authorization).toBe('[REDACTED]');
    expect(out.DATABASE_URL).toBe('[REDACTED]');
    expect(out.note).toContain('postgres://[REDACTED]');
    expect(JSON.stringify(out)).not.toContain('hunter2');
    expect(JSON.stringify(out)).not.toContain('rt_123');
  });

  it('classifies operational vs unexpected errors correctly', () => {
    const validation = classifyError(new AppValidationError('bad field'));
    expect(validation).toMatchObject({ statusCode: 400, isOperational: true });
    expect(validation.severity).toBe('WARNING');

    const generic = classifyError(new Error('boom'));
    expect(generic).toMatchObject({ statusCode: 500, isOperational: false });

    const appErr = classifyError(new AppError('crash', { statusCode: 500, isOperational: false, severity: 'CRITICAL' }));
    expect(appErr.severity).toBe('CRITICAL');
    expect(appErr.isOperational).toBe(false);

    const zodLike = classifyError({ name: 'ZodError', issues: [{ message: 'x' }] });
    expect(zodLike).toMatchObject({ statusCode: 400, isOperational: true });

    const notFound = classifyError({ name: 'NotFoundError', status: 404, message: 'nope' });
    expect(notFound).toMatchObject({ statusCode: 404, isOperational: true });
  });

  it('dedupes alerts: first sends, repeats within the window are throttled but still counted', () => {
    const key = { kind: 'DatabaseConnectionError', module: 'diagnostics', message: 'db timeout after 3001ms' };
    const t0 = Date.now();
    const first = evaluateAlert(key, t0);
    const second = evaluateAlert({ ...key, message: 'db timeout after 4222ms' }, t0 + 1000);
    const third = evaluateAlert(key, t0 + 2000);
    expect(first.send).toBe(true);
    expect(second.send).toBe(false);
    expect(second.reason).toBe('throttled');
    expect(third.send).toBe(false);
    expect(third.totalOccurrences).toBe(3); // every occurrence tracked
  });

  it('builds a professional alert email that carries the Error ID and never a bare password', () => {
    const entry: StructuredErrorEntry = {
      errorId: 'ERR-20260828-000125',
      timestamp: '2026-08-28T22:15:00.000Z',
      appVersion: '1.0.0',
      environment: 'production',
      service: 'epoch-backend',
      severity: 'CRITICAL',
      module: 'patients',
      endpoint: '/api/v1/patients',
      method: 'POST',
      userRole: 'Receptionist',
      userId: 7,
      requestId: 'REQ-DEADBEEF',
      kind: 'DatabaseConnectionError',
      message: 'Database connection timeout',
      stack: 'Error: Database connection timeout\n    at db.ts:1:1',
    };
    const { subject, text } = buildErrorEmail(entry, {
      key: 'k',
      send: true,
      occurrencesInWindow: 1,
      totalOccurrences: 1,
      suppressedSinceLastEmail: 0,
      reason: 'first-in-window',
    });
    expect(subject).toBe('[E-POCH ERROR] ERR-20260828-000125');
    expect(text).toContain('ERR-20260828-000125');
    expect(text).toContain('POST /api/v1/patients');
    expect(text).toContain('Receptionist');
    expect(text).toContain('epoch-backend');
    expect(text).toContain('Stack Trace:');
  });
});

describe('Error handling — HTTP integration', () => {
  it('GET /health returns healthy status + version, no secrets', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'healthy' });
    expect(res.body.version).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/secret|password|jwt/i);
  });

  it('unknown route -> 404 in the standard shape, no Error ID', async () => {
    const res = await request(app).get('/api/v1/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: expect.any(String) });
    expect(res.body.errorId).toBeUndefined();
  });

  it('validation error -> friendly 400, standard shape, NO Error ID (no admin alert)', async () => {
    const res = await request(app).get('/api/v1/_diagnostics/boom?type=validation').set('x-test', '1');
    // diagnostics `validation` throws an operational ValidationError
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.errorId).toBeUndefined();
  });

  it('unexpected error -> safe 500 with an Error ID, and no stack trace in the response', async () => {
    const res = await request(app).get('/api/v1/_diagnostics/boom?type=unhandled');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Something went wrong. Please try again.');
    expect(res.body.errorId).toMatch(/^ERR-\d{8}-\d{6}$/);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/at .*\.ts:/); // no stack frames
    expect(raw.toLowerCase()).not.toContain('stack');
  });

  it('async rejected promise in a handler is caught and reported the same way', async () => {
    const res = await request(app).get('/api/v1/_diagnostics/boom?type=async');
    expect(res.status).toBe(500);
    expect(res.body.errorId).toMatch(/^ERR-\d{8}-\d{6}$/);
  });

  it('database failure -> 503 with the safe DB message and an Error ID', async () => {
    const res = await request(app).get('/api/v1/_diagnostics/boom?type=db');
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('Unable to connect to the database. Please try again later.');
    expect(res.body.errorId).toMatch(/^ERR-\d{8}-\d{6}$/);
  });

  it('every unexpected error gets a DISTINCT Error ID', async () => {
    const a = await request(app).get('/api/v1/_diagnostics/boom?type=unhandled');
    const b = await request(app).get('/api/v1/_diagnostics/boom?type=unhandled');
    expect(a.body.errorId).not.toBe(b.body.errorId);
  });
});
