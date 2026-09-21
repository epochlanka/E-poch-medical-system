import { reportError } from './reportError';
import { logger } from './logger';

// Last line of defence: an error that escaped every request context (a stray promise, a timer
// callback, a socket handler). These still get an Error ID, a structured log and an admin alert.

const outOfBandContext = {
  module: 'process',
  endpoint: '(out-of-band)',
  method: '-',
  userRole: null,
  userId: null,
  requestId: null,
};

export const installProcessErrorHandlers = (): void => {
  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${String(reason)}`);
    try {
      reportError(err, outOfBandContext);
    } catch (e) {
      logger.error({ e }, 'Failed to report an unhandledRejection');
    }
  });

  process.on('uncaughtException', (err: Error) => {
    try {
      reportError(err, outOfBandContext);
    } catch (e) {
      logger.error({ e }, 'Failed to report an uncaughtException');
    }
    // The process is now in an undefined state — Node would exit anyway. Give the logger and the
    // (fire-and-forget) alert email a moment to flush, then exit so the supervisor restarts us.
    setTimeout(() => process.exit(1), 1000).unref();
  });
};
