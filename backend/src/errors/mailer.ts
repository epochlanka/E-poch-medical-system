import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

// SMTP settings come only from the environment — no credential ever lives in source or reaches
// the frontend. If SMTP is not configured the alerting layer degrades to "log only": the app
// keeps working, errors are still logged, no email is attempted.

const cfg = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.ERROR_ALERT_FROM || process.env.SMTP_USER || 'E-POCH Error Monitor <no-reply@epoch.local>',
  to: process.env.ERROR_ALERT_EMAIL || 'epochadminlk@gmail.com',
};

export const isEmailConfigured = (): boolean =>
  cfg.host.toLowerCase() === 'json' || Boolean(cfg.host && cfg.user && cfg.pass);

export const emailStatus = () => ({
  configured: isEmailConfigured(),
  host: cfg.host || null,
  to: cfg.to,
  from: cfg.from,
});

let transporter: Transporter | null = null;
const getTransport = (): Transporter | null => {
  // SMTP_HOST=json -> a real transport that "delivers" by returning the composed message
  // instead of sending it. Handy for local testing without real SMTP credentials.
  if (cfg.host.toLowerCase() === 'json') {
    if (!transporter) transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return transporter;
};

export interface OutgoingAlert {
  subject: string;
  text: string;
}

/** Sends an alert. Never throws — a failed send must not affect the original request. */
export const sendAlertEmail = async (mail: OutgoingAlert): Promise<{ sent: boolean; skipped?: boolean; error?: string }> => {
  const tx = getTransport();
  if (!tx) return { sent: false, skipped: true };
  try {
    const info = await tx.sendMail({ from: cfg.from, to: cfg.to, subject: mail.subject, text: mail.text });
    if (cfg.host.toLowerCase() === 'json') {
      logger.info({ preview: (info as { message?: string }).message }, `[email preview] ${mail.subject}`);
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to send error-alert email');
    return { sent: false, error: (err as Error).message };
  }
};

/** Optional startup probe so a misconfigured SMTP is visible immediately, not on the first crash. */
export const verifyEmailTransport = async (): Promise<void> => {
  const tx = getTransport();
  if (!tx) {
    logger.warn('Error-alert email is NOT configured (set SMTP_HOST, SMTP_USER, SMTP_PASS). Errors will be logged only.');
    return;
  }
  try {
    await tx.verify();
    logger.info({ to: cfg.to, host: cfg.host }, 'Error-alert email transport verified');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Error-alert SMTP transport could not be verified; alerts may fail');
  }
};
