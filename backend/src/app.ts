import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import passport from 'passport';
import path from 'path';
import { randomBytes } from 'crypto';

import { logger, healthHandler, notFoundHandler, globalErrorHandler } from './errors';

import authRouter from './modules/auth/router';
import dashboardRouter from './modules/dashboard/router';
import patientsRouter from './modules/patients/router';
import familiesRouter from './modules/families/router';
import medicinesRouter from './modules/medicines/router';
import consultationsRouter from './modules/consultations/router';
import prescriptionsRouter from './modules/prescriptions/router';
import pharmacyRouter from './modules/pharmacy/router';
import inventoryRouter from './modules/inventory/router';
import suppliersRouter from './modules/suppliers/router';
import billingRouter from './modules/billing/router';
import reportsRouter from './modules/reports/router';
import settingsRouter from './modules/settings/router';
import securityRouter from './modules/security/router';
import { appointmentsRouter } from './modules/appointments/router';
import icd11Router from './modules/icd11/router';
import labTestOrdersRouter from './modules/labTestOrders/router';
import externalMedicinesRouter from './modules/external-medicines/router';
import lettersRouter from './modules/letters/router';

// Load environment variables
dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// Browser portals share this API and authenticate with a credentialed HttpOnly cookie. Keep
// development ports explicit and require deployments to list their actual portal origins.
const developmentOrigins = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176';
const allowedOrigins = `${process.env.FRONTEND_URLS || developmentOrigins},${process.env.FRONTEND_URL || ''}`
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
  })
);

// Parse JSON request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health probe — no auth, no rate limit, no logging noise. Safe for Docker HEALTHCHECK / monitors.
app.get('/health', healthHandler);

// Request logging (shared pino instance; every request gets a REQ-XXXXXXXX id that also appears
// in any error report generated for it).
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = `REQ-${randomBytes(4).toString('hex').toUpperCase()}`;
      res.setHeader('X-Request-Id', id);
      return id;
    },
  })
);

// Rate limiting
// All portals (admin, doctor, receptionist, pharmacist) share one backend, so on a single
// dev machine they all count against the same IP's budget — keep this generous enough for
// several portals polling simultaneously while still guarding against abuse.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Limit each IP to 2000 requests per `window` (here, per 15 minutes)
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter);

// Initialize Passport
app.use(passport.initialize());

// Serve uploaded patient photos (frontend runs on a different origin/port in dev,
// so relax Cross-Origin-Resource-Policy for this path only — the images aren't sensitive).
app.use(
  '/uploads',
  (req: Request, res: Response, next: NextFunction) => {
    // Letter templates and issued letters are patient documents — they are only ever served
    // through the authenticated /api/v1/letters routes, never statically.
    if (/^\/(letter-templates|issued-letters)\//.test(req.path)) return res.status(404).end();
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, '..', 'uploads'))
);

// Setup API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/patients', patientsRouter);
app.use('/api/v1/families', familiesRouter);
app.use('/api/v1/medicines', medicinesRouter);
app.use('/api/v1/consultations', consultationsRouter);
app.use('/api/v1/prescriptions', prescriptionsRouter);
app.use('/api/v1/pharmacy', pharmacyRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/suppliers', suppliersRouter);
app.use('/api/v1/invoices', billingRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/security', securityRouter);
app.use('/api/v1/appointments', appointmentsRouter);
app.use('/api/v1/icd11', icd11Router);
app.use('/api/v1/lab-test-orders', labTestOrdersRouter);
app.use('/api/v1/external-medicines', externalMedicinesRouter);
app.use('/api/v1/letters', lettersRouter);

// Deliberate-error endpoints for testing the error pipeline. OFF unless explicitly enabled and
// never in production (see backend/src/errors/diagnostics.ts).
if (process.env.ENABLE_ERROR_TEST_ROUTES === 'true' && process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { diagnosticsRouter } = require('./errors/diagnostics');
  app.use('/api/v1/_diagnostics', diagnosticsRouter);
  logger.warn('Error test routes are ENABLED at /api/v1/_diagnostics — disable ENABLE_ERROR_TEST_ROUTES in production');
}

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'E-Poch Medical System API is running' });
});

// 404 for any unmatched route, then the single centralized error handler. Every error that a
// controller forwards with `next(err)` — or that a module's `respondWithServerError` routes —
// is classified, given an Error ID when unexpected, logged with full context, and alerted to
// the admin (deduplicated). Stack traces never leave the server.
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
