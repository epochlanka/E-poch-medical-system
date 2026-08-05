import { Request, Response, NextFunction } from 'express';
import { appointmentsService } from './service';

export class AppointmentsController {
  
  createAppointment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Assuming req.user is set by auth middleware
      const created_by = (req as any).user?.user_id || 1;
      const data = {
        patient_id: req.body.patient_id,
        doctor_id: req.body.doctor_id,
        scheduled_at: new Date(req.body.scheduled_at),
        reason: req.body.reason,
        created_by,
      };

      const appointment = await appointmentsService.createAppointment(data);
      res.status(201).json(appointment);
    } catch (error) {
      next(error);
    }
  };

  getLiveQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queue = await appointmentsService.getLiveQueue();
      res.status(200).json(queue);
    } catch (error) {
      next(error);
    }
  };

  getDoctors = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const doctors = await appointmentsService.getDoctors(search);
      res.status(200).json({ data: doctors });
    } catch (error) {
      next(error);
    }
  };

  getAllAppointments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { doctor_id, status } = req.query;
      const filters = {
        doctor_id: doctor_id ? Number(doctor_id) : undefined,
        status: status ? String(status) : undefined
      };

      const appointments = await appointmentsService.getAllAppointments(filters);
      res.status(200).json(appointments);
    } catch (error) {
      next(error);
    }
  };

  listAppointments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, doctorId, status, date, page, limit } = req.query as any;
      const result = await appointmentsService.listAppointments({
        search,
        doctorId: doctorId ? Number(doctorId) : undefined,
        status,
        date: date ? new Date(date) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await appointmentsService.getStats();
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  getTodaysSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await appointmentsService.getTodaysSchedule();
      res.status(200).json(schedule);
    } catch (error) {
      next(error);
    }
  };

  getCalendarSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const year = Number(req.query.year);
      const month = Number(req.query.month);
      const summary = await appointmentsService.getCalendarSummary(year, month);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment_id = Number(req.params.id);
      const { status } = req.body;

      const updated = await appointmentsService.updateStatus(appointment_id, status);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  updateTime = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment_id = Number(req.params.id);
      const { scheduled_at } = req.body;

      const updated = await appointmentsService.updateTime(appointment_id, new Date(scheduled_at));
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };
}

export const appointmentsController = new AppointmentsController();
