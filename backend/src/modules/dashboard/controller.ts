import { Request, Response } from 'express';
import {
  getOverview,
  getQueueSnapshot,
  getFollowUpsDue,
  getFollowUpsList,
  getAlerts,
  getRevenueTrend,
  getRecentPrescriptions,
  getTopMedicines,
  getDoctorDashboard,
  getReceptionistOverview,
  getPharmacistOverview,
} from './service';
import { respondWithServerError } from '../../errors';

const parseThresholdDays = (value: unknown, fallback = 90) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Doctors only ever see their own queue/follow-ups; other roles see everything.
const doctorScope = (req: Request): number | undefined => {
  const user = req.user as any;
  return user?.role === 'Doctor' ? user.user_id : undefined;
};

export const overview = async (req: Request, res: Response) => {
  try {
    const data = await getOverview(parseThresholdDays(req.query.days));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const queueSnapshot = async (req: Request, res: Response) => {
  try {
    const data = await getQueueSnapshot(doctorScope(req));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const followUpsDue = async (req: Request, res: Response) => {
  try {
    const data = await getFollowUpsDue(doctorScope(req));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

const VALID_BUCKETS = ['all', 'overdue', 'today', 'week', 'month'];

export const followUpsList = async (req: Request, res: Response) => {
  try {
    const bucket = VALID_BUCKETS.includes(String(req.query.bucket)) ? (req.query.bucket as any) : 'all';
    const data = await getFollowUpsList({
      doctorId: doctorScope(req),
      bucket,
      search: req.query.search ? String(req.query.search) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const alerts = async (req: Request, res: Response) => {
  try {
    const data = await getAlerts(parseThresholdDays(req.query.days));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const revenueTrend = async (req: Request, res: Response) => {
  try {
    const data = await getRevenueTrend(parsePositiveInt(req.query.days, 30));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const recentPrescriptions = async (req: Request, res: Response) => {
  try {
    const data = await getRecentPrescriptions(parsePositiveInt(req.query.limit, 5));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const doctorDashboard = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const data = await getDoctorDashboard(user.user_id);
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const receptionistDashboard = async (req: Request, res: Response) => {
  try {
    const data = await getReceptionistOverview();
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const pharmacistDashboard = async (req: Request, res: Response) => {
  try {
    const data = await getPharmacistOverview();
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};

export const topMedicines = async (req: Request, res: Response) => {
  try {
    const data = await getTopMedicines(parsePositiveInt(req.query.limit, 5), parsePositiveInt(req.query.days, 30));
    res.status(200).json(data);
  } catch (error: any) {
    return respondWithServerError(req, res, error, 'dashboard');
  }
};
