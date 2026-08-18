import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { uploadsDir } from './service';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Doctor', 'Receptionist'];
const WRITE_ROLES = ['Doctor']; // only a doctor may create a lab test order (business rule #1)
const RESULT_ROLES = ['Admin', 'Receptionist', 'Doctor'];
const REVIEW_ROLES = ['Doctor'];
const CANCEL_ROLES = ['Doctor', 'Admin'];

const createSchema = z.object({
  body: z.object({
    consultation_id: z.number().int().positive(),
    test_name: z.string().min(1, 'Test name is required'),
    test_category: z.string().optional(),
    instructions: z.string().optional(),
    priority: z.enum(['Routine', 'Urgent', 'STAT']).optional(),
    additional_notes: z.string().optional(),
  }),
});

const idParams = z.object({ labTestOrderId: z.coerce.number().int().positive() });
const idParamsSchema = z.object({ params: idParams });

const listSchema = z.object({
  query: z.object({
    patientId: z.string().optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    consultationId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Pending', 'Result Received', 'Reviewed', 'Cancelled']).optional(),
    priority: z.enum(['Routine', 'Urgent', 'STAT']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const reviewSchema = z.object({
  params: idParams,
  body: z.object({ review_notes: z.string().optional() }),
});

const contextParamsSchema = z.object({ params: z.object({ consultationId: z.coerce.number().int().positive() }) });

// ---- Report attachment (Multer) ---------------------------------------------

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_REPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.params.labTestOrderId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_REPORT_TYPES.includes(file.mimetype)) return cb(new Error('Only PDF, JPEG, or PNG files are allowed'));
    cb(null, true);
  },
});

const uploadReportMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('report')(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : 'Upload failed' });
    next();
  });
};

// ---- Routes -------------------------------------------------------------------
// Static-segment routes (/context/:x) before the generic '/:labTestOrderId' catch-all, per this
// codebase's route-ordering convention.

router.get('/context/:consultationId', requireRole(READ_ROLES), validate(contextParamsSchema), controller.context);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);
router.get('/:labTestOrderId', requireRole(READ_ROLES), validate(idParamsSchema), controller.getById);
router.get('/:labTestOrderId/print', requireRole(READ_ROLES), validate(idParamsSchema), controller.printRequest);
router.post('/:labTestOrderId/result', requireRole(RESULT_ROLES), validate(idParamsSchema), uploadReportMiddleware, controller.enterResult);
router.post('/:labTestOrderId/review', requireRole(REVIEW_ROLES), validate(reviewSchema), controller.review);
router.post('/:labTestOrderId/cancel', requireRole(CANCEL_ROLES), validate(idParamsSchema), controller.cancel);

export default router;
