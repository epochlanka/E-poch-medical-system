import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Pharmacist'];

const searchSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    includeInactive: z.string().optional(),
  }),
});

const medicineIdParamsSchema = z.object({ params: z.object({ medicineId: z.coerce.number().int().positive() }) });

const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    generic_name: z.string().optional(),
    category: z.string().optional(),
    form: z.string().optional(),
    strength: z.string().optional(),
    unit: z.string().min(1, 'Unit is required'),
    reorder_level: z.number().int().min(0).optional(),
    unit_price: z.number().min(0).optional(),
    barcode: z.string().optional(),
  }),
});

const updateSchema = z.object({
  params: z.object({ medicineId: z.coerce.number().int().positive() }),
  body: z.object({
    name: z.string().min(1).optional(),
    generic_name: z.string().optional(),
    category: z.string().optional(),
    form: z.string().optional(),
    strength: z.string().optional(),
    unit: z.string().min(1).optional(),
    reorder_level: z.number().int().min(0).optional(),
    unit_price: z.number().min(0).optional(),
    barcode: z.string().optional(),
    is_active: z.boolean().optional(),
  }),
});

router.get('/', requireRole(READ_ROLES), validate(searchSchema), controller.search);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);
router.get('/:medicineId', requireRole(READ_ROLES), validate(medicineIdParamsSchema), controller.getById);
router.put('/:medicineId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);

export default router;
