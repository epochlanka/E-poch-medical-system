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

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Doctor'];

const vitalsSchema = z
  .object({
    bp_systolic: z.number().positive().optional(),
    bp_diastolic: z.number().positive().optional(),
    temp: z.number().positive().optional(),
    pulse: z.number().positive().optional(),
    respiratory_rate: z.number().positive().optional(),
    spo2: z.number().positive().max(100).optional(),
    weight: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .optional();

const consultationIdParams = z.object({ consultationId: z.coerce.number().int().positive() });
const consultationIdParamsSchema = z.object({ params: consultationIdParams });

const clinicalFields = {
  vitals: vitalsSchema,
  complaint: z.string().optional(),
  history_of_present_illness: z.string().optional(),
  examination_findings: z.string().optional(),
  medical_history: z.array(z.string()).optional(),
  diagnosis: z.string().optional(),
  icd10_code: z.string().optional(),
  notes: z.string().optional(),
  allergies_ack: z.boolean().optional(),
};

const createSchema = z.object({
  body: z.object({
    appointment_id: z.number().int().positive(),
    ...clinicalFields,
    follow_up_date: z.coerce.date().optional(),
  }),
});

const updateSchema = z.object({
  params: consultationIdParams,
  body: z.object({
    ...clinicalFields,
    follow_up_date: z.string().nullable().optional(),
  }),
});

const amendSchema = z.object({
  params: consultationIdParams,
  body: z.object({
    field: z.enum(['complaint', 'history_of_present_illness', 'examination_findings', 'diagnosis', 'icd10_code', 'notes', 'follow_up_date']),
    new_value: z.string().nullable(),
    reason: z.string().min(1, 'An amendment reason is required'),
  }),
});

const listSchema = z.object({
  query: z.object({
    patientId: z.string().optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Draft', 'Finalized']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    diagnosisKeyword: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const contextParamsSchema = z.object({ params: z.object({ appointmentId: z.coerce.number().int().positive() }) });

// ---- Attach Files (Multer) --------------------------------------------------

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.params.consultationId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOC_TYPES.includes(file.mimetype)) return cb(new Error('Only PDF, JPEG, or PNG files are allowed'));
    cb(null, true);
  },
});

const uploadDocMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : 'Upload failed' });
    next();
  });
};

// ---- Routes -----------------------------------------------------------------
// Static-segment routes (/context/:appointmentId, /documents/:documentId) are registered
// before the generic /:consultationId catch-all, per this codebase's route-ordering rule.

router.get('/context/:appointmentId', requireRole(READ_ROLES), validate(contextParamsSchema), controller.context);
router.delete('/documents/:documentId', requireRole(WRITE_ROLES), controller.deleteDocument);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);

router.get('/:consultationId', requireRole(READ_ROLES), validate(consultationIdParamsSchema), controller.getById);
router.put('/:consultationId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);
router.post('/:consultationId/finalize', requireRole(WRITE_ROLES), validate(consultationIdParamsSchema), controller.finalize);
router.post('/:consultationId/amend', requireRole(WRITE_ROLES), validate(amendSchema), controller.amend);
router.get('/:consultationId/amendments', requireRole(READ_ROLES), validate(consultationIdParamsSchema), controller.amendments);

router.post('/:consultationId/documents', requireRole(WRITE_ROLES), validate(consultationIdParamsSchema), uploadDocMiddleware, controller.uploadDocument);
router.get('/:consultationId/documents', requireRole(READ_ROLES), validate(consultationIdParamsSchema), controller.listDocuments);

export default router;
