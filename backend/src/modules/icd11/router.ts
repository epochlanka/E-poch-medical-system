import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const WRITE_ROLES = ['Admin', 'Doctor'];

const searchSchema = z.object({
  query: z.object({
    q: z.string().min(2, 'Search term must be at least 2 characters'),
  }),
});

router.get('/search', requireRole(WRITE_ROLES), validate(searchSchema), controller.search);

export default router;
