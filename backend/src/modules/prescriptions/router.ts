import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Doctor'];

const itemSchema = z.object({
  medicine_id: z.number().int().positive(),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  route: z.string().optional(),
  qty: z.number().int().positive(),
});

const createSchema = z.object({
  body: z
    .object({
      consultation_id: z.number().int().positive(),
      items: z.array(itemSchema).min(1).optional(),
      refill_of_prescription_id: z.number().int().positive().optional(),
      allergyAck: z.boolean().optional(),
    })
    .refine((data) => !!data.items || !!data.refill_of_prescription_id, {
      message: 'Provide items, or refill_of_prescription_id to copy items from a prior prescription',
      path: ['items'],
    }),
});

const prescriptionIdParams = z.object({ prescriptionId: z.coerce.number().int().positive() });
const prescriptionIdParamsSchema = z.object({ params: prescriptionIdParams });

const listSchema = z.object({
  query: z.object({
    patientId: z.string().optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Pending', 'Preparing', 'Dispensed', 'Collected']).optional(),
    medicineId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const contextParamsSchema = z.object({ params: z.object({ consultationId: z.coerce.number().int().positive() }) });

router.get('/context/:consultationId', requireRole(READ_ROLES), validate(contextParamsSchema), controller.context);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);
router.get('/:prescriptionId', requireRole(READ_ROLES), validate(prescriptionIdParamsSchema), controller.getById);
router.get('/:prescriptionId/pdf', requireRole(READ_ROLES), validate(prescriptionIdParamsSchema), controller.getPdf);

export default router;
