import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Receptionist'];

const familyIdParams = z.object({ familyId: z.coerce.number().int().positive() });
const familyIdParamsSchema = z.object({ params: familyIdParams });

const createSchema = z.object({
  body: z.object({
    family_name: z.string().min(1, 'Family name is required'),
    address: z.string().optional(),
    city: z.string().optional(),
    family_type: z.string().optional(),
    contact_no: z.string().optional(),
  }),
});

const updateSchema = z.object({
  params: familyIdParams,
  body: z.object({
    family_name: z.string().min(1).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    family_type: z.string().optional(),
    contact_no: z.string().optional(),
  }),
});

const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    status: z.enum(['active', 'inactive', 'all']).optional(),
    familyType: z.string().optional(),
    city: z.string().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const headSchema = z.object({
  params: familyIdParams,
  body: z.object({ patient_id: z.string().min(1) }),
});

const mergeSchema = z.object({
  body: z
    .object({
      primaryFamilyId: z.number().int().positive(),
      secondaryFamilyId: z.number().int().positive(),
      reason: z.string().optional(),
    })
    .refine((data) => data.primaryFamilyId !== data.secondaryFamilyId, {
      message: 'primaryFamilyId and secondaryFamilyId must be different',
      path: ['secondaryFamilyId'],
    }),
});

// Family Merge Tool
router.post('/merge', requireRole(WRITE_ROLES), validate(mergeSchema), controller.merge);

// Family Directory
router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.get('/stats', requireRole(READ_ROLES), controller.stats);
router.post('/', requireRole(WRITE_ROLES), validate(createSchema), controller.create);
router.get('/:familyId', requireRole(READ_ROLES), validate(familyIdParamsSchema), controller.getById);
router.put('/:familyId', requireRole(WRITE_ROLES), validate(updateSchema), controller.update);

// Family Member Roster
router.get('/:familyId/members', requireRole(READ_ROLES), validate(familyIdParamsSchema), controller.members);

// Head of Family Assignment
router.patch('/:familyId/head', requireRole(WRITE_ROLES), validate(headSchema), controller.setHead);

export default router;
