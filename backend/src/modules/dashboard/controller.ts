import { Request, Response } from 'express';
import { getOverview, getQueueSnapshot, getFollowUpsDue, getAlerts } from './service';

const parseThresholdDays = (value: unknown, fallback = 90) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
    req.log.error(error);
    res.status(500).json({ message: 'Failed to load dashboard overview' });
  }
};

export const queueSnapshot = async (req: Request, res: Response) => {
  try {
    const data = await getQueueSnapshot(doctorScope(req));
    res.status(200).json(data);
  } catch (error: any) {
    req.log.error(error);
    res.status(500).json({ message: 'Failed to load queue snapshot' });
  }
};

export const followUpsDue = async (req: Request, res: Response) => {
  try {
    const data = await getFollowUpsDue(doctorScope(req));
    res.status(200).json(data);
  } catch (error: any) {
    req.log.error(error);
    res.status(500).json({ message: 'Failed to load follow-ups due' });
  }
};

export const alerts = async (req: Request, res: Response) => {
  try {
    const data = await getAlerts(parseThresholdDays(req.query.days));
    res.status(200).json(data);
  } catch (error: any) {
    req.log.error(error);
    res.status(500).json({ message: 'Failed to load alerts' });
  }
};
