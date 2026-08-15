import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { overview, queueSnapshot, followUpsDue, followUpsList, alerts, revenueTrend, recentPrescriptions, topMedicines, doctorDashboard } from './controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['Admin', 'Doctor', 'Pharmacist', 'Receptionist']));

router.get('/doctor-overview', requireRole(['Doctor']), doctorDashboard);

router.get('/overview', overview);
router.get('/queue', queueSnapshot);
router.get('/follow-ups', followUpsDue);
router.get('/follow-ups/list', followUpsList);
router.get('/alerts', alerts);
router.get('/revenue-trend', revenueTrend);
router.get('/recent-prescriptions', recentPrescriptions);
router.get('/top-medicines', topMedicines);

export default router;
