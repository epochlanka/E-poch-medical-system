import { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { APP_VERSION, ENVIRONMENT } from './logger';

// A lightweight liveness/readiness probe. No auth, no rate limiting, no secrets in the payload —
// safe for a Docker HEALTHCHECK or an uptime monitor to poll.

// 2000ms was too tight for a Supabase pooler that's geographically distant from wherever this
// runs — a fresh connection there can legitimately take 2-4s (TLS handshake + auth), which was
// flipping this to "down" even though the database was fine, just not instant. That false
// reading matters beyond cosmetics: docker-compose.prod.yml gates frontend container startup
// on this healthcheck passing.
export const checkDatabase = async (timeoutMs = 8000): Promise<'up' | 'down'> => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('db check timeout')), timeoutMs)),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
};

export const healthHandler: RequestHandler = async (_req, res) => {
  const database = await checkDatabase();
  const healthy = database === 'up';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    version: APP_VERSION,
    environment: ENVIRONMENT,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    timestamp: new Date().toISOString(),
  });
};
