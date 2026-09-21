import express from 'express';
import request from 'supertest';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { Writable } from 'stream';
import { httpSerializers, loggerOptions, sanitizeUrl } from './logger';

// Builds the SAME logger + serializers app.ts uses, but writes to memory so the tests can look at
// exactly what would land in the log file.
const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const app = express();
  app.use(pinoHttp({ logger: pino(loggerOptions, stream), serializers: httpSerializers }));
  app.post('/api/v1/auth/login', (_req, res) => {
    res.cookie('epoch_session', 'SECRET-SESSION-TOKEN-abc123', { httpOnly: true });
    res.setHeader('Authorization', 'Bearer SECRET-BEARER-xyz');
    res.json({ ok: true });
  });
  app.get('/api/v1/patients', (_req, res) => res.json([]));
  return { app, output: () => lines.join('') };
};

describe('HTTP request logging', () => {
  it('never writes a session cookie set on a response to the log', async () => {
    const { app, output } = capture();
    await request(app).post('/api/v1/auth/login').send({});
    expect(output()).toContain('/api/v1/auth/login'); // it did log the request
    expect(output()).not.toContain('SECRET-SESSION-TOKEN-abc123');
    expect(output()).not.toContain('SECRET-BEARER-xyz');
    expect(output().toLowerCase()).not.toContain('set-cookie');
  });

  it('never writes incoming credentials to the log', async () => {
    const { app, output } = capture();
    await request(app).get('/api/v1/patients').set('Cookie', 'epoch_session=INCOMING-COOKIE-999').set('Authorization', 'Bearer INCOMING-BEARER-777');
    expect(output()).not.toContain('INCOMING-COOKIE-999');
    expect(output()).not.toContain('INCOMING-BEARER-777');
  });

  it('drops patient search terms from the logged URL but keeps the parameter names', async () => {
    const { app, output } = capture();
    await request(app).get('/api/v1/patients?search=Nimal%20Perera&nic=199012345678');
    expect(output()).not.toContain('Nimal');
    expect(output()).not.toContain('Perera');
    expect(output()).not.toContain('199012345678');
    expect(output()).toContain('search=[REDACTED]');
    expect(output()).toContain('nic=[REDACTED]');
  });

  it('sanitizeUrl leaves a query-less URL untouched', () => {
    expect(sanitizeUrl('/api/v1/patients/PT-000001')).toBe('/api/v1/patients/PT-000001');
    expect(sanitizeUrl('/x?a=1&a=2&b=')).toBe('/x?a=[REDACTED]&b=[REDACTED]');
  });
});
