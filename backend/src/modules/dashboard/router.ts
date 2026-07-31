import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { overview, queueSnapshot, followUpsDue, alerts } from './controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['Admin', 'Doctor', 'Pharmacist', 'Receptionist']));

router.get('/overview', overview);
router.get('/queue', queueSnapshot);
router.get('/follow-ups', followUpsDue);
router.get('/alerts', alerts);

export default router;
