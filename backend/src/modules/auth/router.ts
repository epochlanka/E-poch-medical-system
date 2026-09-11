import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
    totpToken: z.string().optional(),
  }),
});

router.post('/login', validate(loginSchema), controller.login);
router.get('/me', requireAuth, controller.me);
router.post('/logout', requireAuth, controller.logout);

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }),
});

router.post('/change-password', requireAuth, validate(changePasswordSchema), controller.changePassword);

// 2FA is Admin-only (FR-008) — self-service on the caller's own account.
const totpTokenSchema = z.object({ body: z.object({ token: z.string().min(1, 'token is required') }) });
const totpPasswordSchema = z.object({ body: z.object({ password: z.string().min(1, 'password is required') }) });

router.post('/2fa/setup', requireAuth, requireRole(['Admin']), controller.setupTotp);
router.post('/2fa/verify', requireAuth, requireRole(['Admin']), validate(totpTokenSchema), controller.verifyTotp);
router.post('/2fa/disable', requireAuth, requireRole(['Admin']), validate(totpPasswordSchema), controller.disableTotp);

export default router;
