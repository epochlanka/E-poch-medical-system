import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import passport from 'passport';
import path from 'path';

import authRouter from './modules/auth/router';
import dashboardRouter from './modules/dashboard/router';
import patientsRouter from './modules/patients/router';
import familiesRouter from './modules/families/router';

// Load environment variables
dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS
app.use(cors());

// Parse JSON request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(pinoHttp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
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

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'E-Poch Medical System API is running' });
});

// Basic Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  req.log.error(err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
    },
  });
});

export default app;
