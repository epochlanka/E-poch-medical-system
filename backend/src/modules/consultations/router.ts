import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
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
    weight: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .optional();

const consultationIdParams = z.object({ consultationId: z.coerce.number().int().positive() });
const consultationIdParamsSchema = z.object({ params: consultationIdParams });

const createSchema = z.object({
  body: z.object({
    appointment_id: z.number().int().positive(),
    vitals: vitalsSchema,
    complaint: z.string().optional(),
    diagnosis: z.string().optional(),
    icd10_code: z.string().optional(),
    notes: z.string().optional(),
    follow_up_date: z.coerce.date().optional(),
    allergies_ack: z.boolean().optional(),
  }),
});

const updateSchema = z.object({
  params: consultationIdParams,
  body: z.object({
    vitals: vitalsSchema,
    complaint: z.string().optional(),
    diagnosis: z.string().optional(),
    icd10_code: z.string().optional(),
    notes: z.string().optional(),
    follow_up_date: z.string().nullable().optional(),
    allergies_ack: z.boolean().optional(),
  }),
});

const amendSchema = z.object({
  params: consultationIdParams,
  body: z.object({
    field: z.enum(['complaint', 'diagnosis', 'icd10_code', 'notes', 'follow_up_date']),
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

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);

router.get('/:consultationId', requireRole(READ_ROLES), validate(consultationIdParamsSchema), controller.getById);
router.put('/:consultationId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);
router.post('/:consultationId/finalize', requireRole(WRITE_ROLES), validate(consultationIdParamsSchema), controller.finalize);
router.post('/:consultationId/amend', requireRole(WRITE_ROLES), validate(amendSchema), controller.amend);
router.get('/:consultationId/amendments', requireRole(READ_ROLES), validate(consultationIdParamsSchema), controller.amendments);

export default router;
