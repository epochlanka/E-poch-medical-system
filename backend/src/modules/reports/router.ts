import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const ADMIN_ONLY = ['Admin'];
const DOCTOR_ROLES = ['Admin', 'Doctor'];
const PHARMACIST_ROLES = ['Admin', 'Pharmacist'];

const formatSchema = z.enum(['json', 'csv', 'pdf']).optional();

const rangeSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    format: formatSchema,
  }),
});

const topMedicinesSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().positive().optional(),
    format: formatSchema,
  }),
});

const auditLogSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    userId: z.coerce.number().int().positive().optional(),
    entity: z.string().optional(),
    action: z.string().optional(),
    entityId: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    format: formatSchema,
  }),
});

const doctorScopedSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    format: formatSchema,
  }),
});

const expiringBatchesSchema = z.object({
  query: z.object({ days: z.coerce.number().int().positive().optional(), format: formatSchema }),
});

const noQuerySchema = z.object({ query: z.object({ format: formatSchema }) });

router.get('/patient-volume', requireRole(ADMIN_ONLY), validate(rangeSchema), controller.patientVolume);
router.get('/revenue', requireRole(ADMIN_ONLY), validate(rangeSchema), controller.revenue);
router.get('/top-medicines', requireRole(ADMIN_ONLY), validate(topMedicinesSchema), controller.topMedicines);
router.get('/audit-log', requireRole(ADMIN_ONLY), validate(auditLogSchema), controller.auditLog);

router.get('/doctor/consultations', requireRole(DOCTOR_ROLES), validate(doctorScopedSchema), controller.doctorConsultations);
router.get('/doctor/follow-ups-due', requireRole(DOCTOR_ROLES), validate(doctorScopedSchema), controller.doctorFollowUpsDue);

router.get('/pharmacist/low-stock', requireRole(PHARMACIST_ROLES), validate(noQuerySchema), controller.lowStock);
router.get('/pharmacist/expiring-batches', requireRole(PHARMACIST_ROLES), validate(expiringBatchesSchema), controller.expiringBatches);
router.get('/pharmacist/dispensing-volume', requireRole(PHARMACIST_ROLES), validate(rangeSchema), controller.dispensingVolume);

export default router;
