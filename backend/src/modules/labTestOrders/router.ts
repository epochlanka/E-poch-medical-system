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
// Reception may record that the physical report is back, but must never see/enter clinical
// values — that split is exactly why "mark received" and "complete" are two separate role sets.
const RECEIVE_ROLES = ['Admin', 'Doctor', 'Receptionist'];
const RESULT_ROLES = ['Admin', 'Doctor']; // entering/finalizing clinical values — Reception excluded
const CANCEL_ROLES = ['Doctor', 'Admin'];

const resultParameterSchema = z.object({
  parameter_id: z.number().int().positive().optional(),
  parameter_name: z.string().min(1),
  unit: z.string().optional(),
  reference_range: z.string().optional(),
  result_value: z.string().min(1),
});

const createSchema = z.object({
  body: z.object({
    consultation_id: z.number().int().positive(),
    catalog_test_id: z.number().int().positive().optional(),
    test_name: z.string().optional(),
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
    status: z.enum(['Pending', 'Report Received', 'Completed', 'Cancelled']).optional(),
    priority: z.enum(['Routine', 'Urgent', 'STAT']).optional(),
    testId: z.coerce.number().int().positive().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const catalogSearchSchema = z.object({ query: z.object({ search: z.string().optional() }) });
const catalogParamsSchema = z.object({ params: z.object({ testId: z.coerce.number().int().positive() }) });

const completeSchema = z.object({
  params: idParams,
  body: z.object({
    results: z.array(resultParameterSchema).min(1),
    doctor_notes: z.string().optional(),
    interpretation: z.string().optional(),
  }),
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
// Static-segment routes (/context/:x, /catalog...) before the generic '/:labTestOrderId'
// catch-all, per this codebase's route-ordering convention.

router.get('/context/:consultationId', requireRole(READ_ROLES), validate(contextParamsSchema), controller.context);
router.get('/catalog', requireRole(READ_ROLES), validate(catalogSearchSchema), controller.searchCatalog);
router.get('/catalog/:testId/parameters', requireRole(READ_ROLES), validate(catalogParamsSchema), controller.catalogParameters);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);
router.get('/:labTestOrderId', requireRole(READ_ROLES), validate(idParamsSchema), controller.getById);
router.get('/:labTestOrderId/print', requireRole(READ_ROLES), validate(idParamsSchema), controller.printRequest);
router.get('/:labTestOrderId/result-print', requireRole(RESULT_ROLES), validate(idParamsSchema), controller.printResult);
router.post('/:labTestOrderId/received', requireRole(RECEIVE_ROLES), validate(idParamsSchema), uploadReportMiddleware, controller.markReceived);
router.post('/:labTestOrderId/complete', requireRole(RESULT_ROLES), validate(completeSchema), controller.complete);
router.put('/:labTestOrderId/complete', requireRole(RESULT_ROLES), validate(completeSchema), controller.amendCompleted);
router.post('/:labTestOrderId/cancel', requireRole(CANCEL_ROLES), validate(idParamsSchema), controller.cancel);

export default router;
