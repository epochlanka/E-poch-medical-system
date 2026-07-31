import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Receptionist'];

// ---- Photo upload (Multer) --------------------------------------------------

const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'patients');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.params.patientId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PHOTO_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

const uploadPhotoMiddleware = (req: Request, res: Response, next: NextFunction) => {
  upload.single('photo')(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : 'Upload failed' });
    next();
  });
};

// ---- Validation schemas ------------------------------------------------------

const patientIdParams = z.object({ patientId: z.string().min(1) });

const registerSchema = z.object({
  body: z
    .object({
      full_name: z.string().min(1, 'Full name is required'),
      dob: z.coerce.date(),
      gender: z.string().min(1, 'Gender is required'),
      nic: z.string().min(1).optional(),
      guardian_nic: z.string().min(1).optional(),
      phone: z.string().optional(),
      blood_group: z.string().optional(),
      allergies: z.string().optional(),
      family_id: z.number().int().positive().optional(),
      new_family: z
        .object({
          family_name: z.string().min(1),
          address: z.string().optional(),
          contact_no: z.string().optional(),
        })
        .optional(),
    })
    .refine((data) => !!data.nic || !!data.guardian_nic, {
      message: 'Either nic or guardian_nic is required (minors without their own NIC use guardian_nic + dob)',
      path: ['nic'],
    })
    .refine((data) => Boolean(data.family_id) !== Boolean(data.new_family), {
      message: 'Provide exactly one of family_id (existing family) or new_family',
      path: ['family_id'],
    }),
});

const checkDuplicateSchema = z.object({
  query: z
    .object({
      nic: z.string().optional(),
      guardianNic: z.string().optional(),
      dob: z.coerce.date().optional(),
    })
    .refine((data) => !!data.nic || (!!data.guardianNic && !!data.dob), {
      message: 'Provide either nic, or guardianNic together with dob',
    }),
});

const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    status: z.enum(['active', 'inactive', 'all']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const updateSchema = z.object({
  params: patientIdParams,
  body: z.object({
    full_name: z.string().min(1).optional(),
    phone: z.string().optional(),
    blood_group: z.string().optional(),
    allergies: z.string().optional(),
    gender: z.string().optional(),
    guardian_nic: z.string().optional(),
    family_id: z.number().int().positive().optional(),
    reason: z.string().optional(),
  }),
});

const statusSchema = z.object({
  params: patientIdParams,
  body: z.object({ is_active: z.boolean(), reason: z.string().optional() }),
});

const historySchema = z.object({
  params: patientIdParams,
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    types: z.string().optional(),
  }),
});

const auditLogSchema = z.object({
  params: patientIdParams,
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const patientIdParamsSchema = z.object({ params: patientIdParams });

const duplicatesListSchema = z.object({
  query: z.object({ status: z.enum(['Pending', 'Dismissed', 'Merged', 'All']).optional() }),
});

const flagIdParams = z.object({ flagId: z.coerce.number().int().positive() });
const dismissSchema = z.object({ params: flagIdParams });
const mergeSchema = z.object({ params: flagIdParams, body: z.object({ primaryPatientId: z.string().min(1) }) });

// ---- Routes -------------------------------------------------------------------
// Static-segment routes (/check-duplicate, /duplicates) must be registered before
// the generic /:patientId route or Express will swallow them as a patient id.

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.get('/check-duplicate', requireRole(WRITE_ROLES), validate(checkDuplicateSchema), controller.checkDuplicate);

router.get('/duplicates', requireRole(WRITE_ROLES), validate(duplicatesListSchema), controller.listDuplicates);
router.post('/duplicates/:flagId/dismiss', requireRole(WRITE_ROLES), validate(dismissSchema), controller.dismissDuplicate);
router.post('/duplicates/:flagId/merge', requireRole(WRITE_ROLES), validate(mergeSchema), controller.mergeDuplicate);

router.post('/', requireRole(WRITE_ROLES), validate(registerSchema), controller.register);

router.get('/:patientId', requireRole(READ_ROLES), validate(patientIdParamsSchema), controller.getById);
router.put('/:patientId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);
router.patch('/:patientId/status', requireRole(WRITE_ROLES), validate(statusSchema), controller.setStatus);
router.post('/:patientId/photo', requireRole(WRITE_ROLES), validate(patientIdParamsSchema), uploadPhotoMiddleware, controller.uploadPhoto);
router.get('/:patientId/history', requireRole(READ_ROLES), validate(historySchema), controller.history);
router.get('/:patientId/history/pdf', requireRole(READ_ROLES), validate(historySchema), controller.historyPdf);
router.get('/:patientId/audit-log', requireRole(READ_ROLES), validate(auditLogSchema), controller.auditLog);

export default router;
