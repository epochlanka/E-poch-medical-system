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
  medicine_id: z.number().int().positive().optional(),
  medicine_name: z.string().optional(),
  generic_name: z.string().optional(),
  brand_name: z.string().optional(),
  dosage_form: z.string().min(1, 'Dosage form is required'),
  strength: z.string().optional(),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  quantity: z.number().positive('Quantity must be a positive number'),
  quantity_unit: z.string().min(1, 'Quantity unit is required'),
  instructions: z.string().optional(),
});

const prescriptionIdParams = z.object({ params: z.object({ prescriptionId: z.coerce.number().int().positive() }) });
const createSchema = z.object({ params: z.object({ prescriptionId: z.coerce.number().int().positive() }), body: itemSchema });
const bulkCreateSchema = z.object({
  params: z.object({ prescriptionId: z.coerce.number().int().positive() }),
  body: z.object({ items: z.array(itemSchema).min(1) }),
});
const patientParams = z.object({
  params: z.object({ patientId: z.string().min(1) }),
  query: z.object({ search: z.string().optional() }),
});
const extItemParams = z.object({ params: z.object({ extItemId: z.coerce.number().int().positive() }) });
const updateSchema = z.object({ params: z.object({ extItemId: z.coerce.number().int().positive() }), body: itemSchema.partial() });

// Static-segment routes (/prescription/..., /patient/...) registered before the /:extItemId
// catch-all, per this codebase's established route-ordering rule.
router.post('/prescription/:prescriptionId/bulk', requireRole(WRITE_ROLES), validate(bulkCreateSchema), controller.bulkCreate);
router.get('/prescription/:prescriptionId/slip', requireRole(READ_ROLES), validate(prescriptionIdParams), controller.getSlip);
router.get('/prescription/:prescriptionId', requireRole(READ_ROLES), validate(prescriptionIdParams), controller.listByPrescription);
router.post('/prescription/:prescriptionId', requireRole(WRITE_ROLES), validate(createSchema), controller.create);

router.get('/patient/:patientId', requireRole(READ_ROLES), validate(patientParams), controller.listByPatient);

router.put('/:extItemId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);
router.delete('/:extItemId', requireRole(WRITE_ROLES), validate(extItemParams), controller.remove);

export default router;
