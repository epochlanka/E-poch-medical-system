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

  // A Doctor caller is always scoped to their own queue, regardless of any doctorId query param
  // they might pass — other roles may use doctorId to filter, or omit it to see every doctor.
  doctorScope = (req: Request): number | undefined => {
    const user = (req as any).user;
    if (user?.role === 'Doctor') return user.user_id;
    const queryDoctorId = req.query.doctorId;
    return queryDoctorId ? Number(queryDoctorId) : undefined;
  };

  getLiveQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queue = await appointmentsService.getLiveQueue(this.doctorScope(req));
      res.status(200).json(queue);
    } catch (error) {
      next(error);
    }
  };

  getQueueStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await appointmentsService.getQueueStats(this.doctorScope(req));
      res.status(200).json(stats);
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
<<<<<<< Updated upstream
      const { doctor_id, status } = req.query;
      const filters = {
        doctor_id: doctor_id ? Number(doctor_id) : undefined,
        status: status ? String(status) : undefined
      };

      const appointments = await appointmentsService.getAllAppointments(filters);
      res.status(200).json(appointments);
=======
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 8, 1), 100);
      const search = req.query.search ? String(req.query.search) : undefined;
      const doctor_id = req.query.doctor_id ? Number(req.query.doctor_id) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const date = req.query.date ? String(req.query.date) : undefined;
      const tab = req.query.tab ? String(req.query.tab) : 'all';

      const result = await appointmentsService.getAllAppointments({ page, limit, search, doctor_id, status, date, tab });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await appointmentsService.getAppointmentStats();
      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  };

  getCalendarSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const summary = await appointmentsService.getCalendarSummary(year, month);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    }
  };

  getTodaysSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blocks = await appointmentsService.getTodaysScheduleBlocks();
      res.status(200).json(blocks);
    } catch (error) {
      next(error);
    }
  };

  getAppointmentById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam ?? '', 10);
      const appointment = await appointmentsService.getAppointmentById(id);
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      res.status(200).json(appointment);
>>>>>>> Stashed changes
    } catch (error) {
      next(error);
    }
  };

  listAppointments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, status, date, dateFrom, dateTo, page, limit } = req.query as any;
      const result = await appointmentsService.listAppointments({
        search,
        doctorId: this.doctorScope(req),
        status,
        date: date ? new Date(date) : undefined,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getSkipStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dateFrom, dateTo } = req.query as any;
      const stats = await appointmentsService.getSkipStats(
        this.doctorScope(req),
        dateFrom ? new Date(dateFrom) : undefined,
        dateTo ? new Date(dateTo) : undefined
      );
      res.status(200).json(stats);
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

      const updated = await appointmentsService.updateStatus(appointment_id, status, (req as any).user);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  };

  skipAppointment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment_id = Number(req.params.id);
      const { reason } = req.body;

      const updated = await appointmentsService.skipAppointment(appointment_id, reason, (req as any).user);
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

  deleteAppointment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const appointment_id = Number(req.params.id);
      await appointmentsService.deleteAppointment(appointment_id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

export const appointmentsController = new AppointmentsController();