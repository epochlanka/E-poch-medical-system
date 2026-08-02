import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { ROLES } from './service';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['Admin']));

router.get('/permission-matrix', controller.permissionMatrix);

const userIdParamsSchema = z.object({ params: z.object({ userId: z.coerce.number().int().positive() }) });

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(ROLES),
    registration_number: z.string().optional(),
  }),
});

const updateUserSchema = z.object({
  params: z.object({ userId: z.coerce.number().int().positive() }),
  body: z.object({
    role: z.enum(ROLES).optional(),
    is_active: z.boolean().optional(),
    registration_number: z.string().optional(),
  }),
});

const resetPasswordSchema = z.object({
  params: z.object({ userId: z.coerce.number().int().positive() }),
  body: z.object({ newPassword: z.string().min(8, 'Password must be at least 8 characters') }),
});

router.get('/users', controller.listUsers);
router.post('/users', validate(createUserSchema), controller.createUser);
router.get('/users/:userId', validate(userIdParamsSchema), controller.getUser);
router.put('/users/:userId', validate(updateUserSchema), controller.updateUser);
router.post('/users/:userId/reset-password', validate(resetPasswordSchema), controller.resetPassword);
router.post('/users/:userId/unlock', validate(userIdParamsSchema), controller.unlockUser);

const sessionIdParamsSchema = z.object({ params: z.object({ sessionId: z.coerce.number().int().positive() }) });

router.get('/sessions', controller.listSessions);
router.delete('/sessions/:sessionId', validate(sessionIdParamsSchema), controller.revokeSession);

export default router;
