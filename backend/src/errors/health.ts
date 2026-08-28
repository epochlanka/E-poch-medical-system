import { RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { APP_VERSION, ENVIRONMENT } from './logger';

// A lightweight liveness/readiness probe. No auth, no rate limiting, no secrets in the payload —
// safe for a Docker HEALTHCHECK or an uptime monitor to poll.

const prisma = new PrismaClient();

export const checkDatabase = async (timeoutMs = 2000): Promise<'up' | 'down'> => {
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
