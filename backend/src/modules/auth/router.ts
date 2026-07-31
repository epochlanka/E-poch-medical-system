import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { login } from './controller';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

router.post('/login', validate(loginSchema), login);

// Route to verify token and logout (stateless JWT, so logout is mostly client-side)
router.post('/logout', requireAuth, (req, res) => {
  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
