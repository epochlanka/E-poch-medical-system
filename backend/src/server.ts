import http from 'http';
import app from './app';
import { prisma } from './lib/prisma';
import { verifyLibreOffice } from './modules/letters/libreoffice';
import { installProcessErrorHandlers, verifyEmailTransport, emailStatus, logger, startHealthProbe } from './errors';
import { reconcileBilling } from './modules/billing/service';

// Catch stray promise rejections / uncaught exceptions before anything else starts.
installProcessErrorHandlers();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  const mail = emailStatus();
  logger.info(
    { emailConfigured: mail.configured, alertRecipient: mail.to },
    mail.configured
      ? `Error-alert email enabled -> ${mail.to}`
      : 'Error-alert email NOT configured (set SMTP_HOST / SMTP_USER / SMTP_PASS) — errors will be logged only'
  );
  void verifyEmailTransport();

  startHealthProbe();

  // Retry any dispense whose invoice sync failed (see reconcileBilling). Unref'd so it never keeps
  // the process alive, and a failed pass is logged, never thrown.
  const runReconcile = () => reconcileBilling().catch((err) => logger.error({ err }, 'Billing reconciliation pass failed'));
  setTimeout(runReconcile, 30_000).unref();
  setInterval(runReconcile, 5 * 60_000).unref();

  // Letters are rendered by LibreOffice. Prove it actually starts rather than just that a file exists,
  // and raise it as an error (so it reaches the alert pipeline) instead of a startup console line.
  verifyLibreOffice()
    .then((version) => logger.info({ libreOffice: version }, 'LibreOffice (letter PDF rendering) is available'))
    .catch((err) =>
      logger.error(
        { err: err.message },
        'LibreOffice is NOT usable — letter preview/issue will fail with 503 until it is installed (or LIBREOFFICE_PATH is set)'
      )
    );
});

// Release the Postgres connection pool on restart/shutdown instead of leaving it to the OS —
// nodemon/PM2/Docker all stop the process this way, and against a pooled remote database
// (Supabase) an unreleased pool can hold connections until the pooler times them out.
const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
