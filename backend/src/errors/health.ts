import { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { APP_VERSION, ENVIRONMENT, logger } from './logger';

// A lightweight liveness/readiness probe. No auth, no rate limiting, no secrets in the payload —
// safe for a Docker HEALTHCHECK or an uptime monitor to poll.
//
// The database check does NOT run per request once startHealthProbe() is called (server.ts).
// A fresh round trip to a remote database can take seconds when the WAN link is slow, and doing one
// per health request meant a single slow moment flipped the container "unhealthy" (and, because
// docker-compose.prod.yml gates the proxy on it, stalled the whole stack's startup). Instead a
// background timer probes on its own schedule, and /health answers instantly from the last result —
// reporting "degraded" only after the database has failed several probes IN A ROW.

export const checkDatabase = async (timeoutMs = 15_000): Promise<'up' | 'down'> => {
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

export interface ProbeState {
  checkedAt: number; // 0 = never probed
  lastOkAt: number;
  consecutiveFailures: number;
  latencyMs: number | null;
}

export const PROBE_INTERVAL_MS = 15_000;
export const FAILURES_BEFORE_DEGRADED = 3; // ~45s of continuous failure
// A database this slow to answer `SELECT 1` will make the whole app feel broken.
export const SLOW_DATABASE_MS = 2_000;

/** Pure: is the database considered up, given the last probe results? */
export const assessDatabase = (state: ProbeState): 'up' | 'down' | 'unknown' => {
  if (state.checkedAt === 0) return 'unknown';
  return state.consecutiveFailures >= FAILURES_BEFORE_DEGRADED ? 'down' : 'up';
};

let state: ProbeState = { checkedAt: 0, lastOkAt: 0, consecutiveFailures: 0, latencyMs: null };
let probing = false;
let started = false;

const probe = async () => {
  if (probing) return;
  probing = true;
  const startedAt = Date.now();
  try {
    const result = await checkDatabase();
    const now = Date.now();
    if (result === 'up') {
      const latencyMs = now - startedAt;
      state = { checkedAt: now, lastOkAt: now, consecutiveFailures: 0, latencyMs };
      if (latencyMs > SLOW_DATABASE_MS) {
        logger.warn({ latencyMs }, 'Database round trip is slow — is the database region far from this server?');
      }
    } else {
      state = { ...state, checkedAt: now, consecutiveFailures: state.consecutiveFailures + 1 };
      if (state.consecutiveFailures === FAILURES_BEFORE_DEGRADED) {
        logger.error({ consecutiveFailures: state.consecutiveFailures }, 'Database has failed repeated health probes — reporting degraded');
      }
    }
  } finally {
    probing = false;
  }
};

export const startHealthProbe = () => {
  if (started) return;
  started = true;
  void probe();
  setInterval(() => void probe(), PROBE_INTERVAL_MS).unref();
};

export const healthHandler: RequestHandler = async (_req, res) => {
  // Before the background probe exists (tests, or the first instant after boot) answer from a live check.
  let database = assessDatabase(state);
  if (!started && database === 'unknown') database = await checkDatabase(8_000);
  if (database === 'unknown') database = 'up'; // just booted; the first probe is in flight

  const healthy = database === 'up';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    version: APP_VERSION,
    environment: ENVIRONMENT,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    databaseLatencyMs: state.latencyMs,
    lastDatabaseSuccessAt: state.lastOkAt ? new Date(state.lastOkAt).toISOString() : null,
    timestamp: new Date().toISOString(),
  });
};
