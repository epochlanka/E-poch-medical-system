import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Pharmacist'];

const prescriptionIdParams = z.object({ prescriptionId: z.coerce.number().int().positive() });
const prescriptionIdParamsSchema = z.object({ params: prescriptionIdParams });

const queueSchema = z.object({
  query: z.object({ status: z.enum(['Pending', 'Preparing', 'Dispensed', 'Collected']).optional() }),
});

const dispenseSchema = z.object({
  params: prescriptionIdParams,
  body: z.object({
    items: z
      .array(
        z.object({
          rx_item_id: z.number().int().positive(),
          batch_id: z.number().int().positive().optional(),
          override_reason: z.string().optional(),
          substitute_medicine_id: z.number().int().positive().optional(),
        })
      )
      .min(1),
  }),
});

const substitutionCreateSchema = z.object({
  body: z.object({
    medicine_id: z.number().int().positive(),
    substitute_medicine_id: z.number().int().positive(),
  }),
});

const substitutionListSchema = z.object({
  query: z.object({ medicineId: z.coerce.number().int().positive().optional() }),
});

router.get('/queue', requireRole(READ_ROLES), validate(queueSchema), controller.queue);

router.get('/substitutions', requireRole(READ_ROLES), validate(substitutionListSchema), controller.listSubstitutions);
router.post('/substitutions', requireRole(WRITE_ROLES), validate(substitutionCreateSchema), controller.createSubstitution);

router.get(
  '/prescriptions/:prescriptionId/batch-suggestions',
  requireRole(READ_ROLES),
  validate(prescriptionIdParamsSchema),
  controller.batchSuggestions
);
router.post(
  '/prescriptions/:prescriptionId/preparing',
  requireRole(WRITE_ROLES),
  validate(prescriptionIdParamsSchema),
  controller.setPreparing
);
router.post('/prescriptions/:prescriptionId/dispense', requireRole(WRITE_ROLES), validate(dispenseSchema), controller.dispense);
router.post('/prescriptions/:prescriptionId/collect', requireRole(WRITE_ROLES), validate(prescriptionIdParamsSchema), controller.collect);
router.get('/prescriptions/:prescriptionId/label', requireRole(READ_ROLES), validate(prescriptionIdParamsSchema), controller.label);

export default router;
