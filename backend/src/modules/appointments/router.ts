import { Router } from 'express';
import { z } from 'zod';
import { appointmentsController } from './controller';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

const APPOINTMENT_STATUSES = ['Waiting', 'Called', 'Consulting', 'Completed', 'Skipped', 'Cancelled', 'No Show'] as const;

const createAppointmentSchema = z.object({
  body: z.object({
    patient_id: z.string().min(1, 'Patient ID is required'),
    doctor_id: z.number().positive('Doctor ID is required'),
    scheduled_at: z.string().datetime({ message: 'Must be a valid ISO datetime' }),
    reason: z.string().optional(),
    is_walk_in: z.boolean().optional(),
    consultation_type: z.string().optional(),
    visit_type: z.enum(['Appointment', 'Follow-up']).optional(),
    priority: z.enum(['Normal', 'Urgent', 'Emergency']).optional(),
    notes: z.string().optional()
  })
});

const availabilitySchema = z.object({
  query: z.object({
    doctorId: z.coerce.number().int().positive(),
    date: z.coerce.date()
  })
});

const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum(APPOINTMENT_STATUSES),
    reason: z.string().optional()
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10))
  })
});

const updateTimeSchema = z.object({
  body: z.object({
    scheduled_at: z.string().datetime({ message: 'Must be a valid ISO datetime' })
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10))
  })
});

const skipSchema = z.object({
  body: z.object({
    reason: z.string().min(1, 'A reason is required to skip a patient')
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10))
  })
});

const listAppointmentsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    doctorId: z.coerce.number().int().positive().optional(),
    // 'Upcoming' is accepted here (list/filter context) but not in updateStatusSchema
    // (write context) — it's a virtual grouping, never a status an appointment is set to.
    status: z.enum([...APPOINTMENT_STATUSES, 'Upcoming']).optional(),
    date: z.coerce.date().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
});

const skipStatsSchema = z.object({
  query: z.object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional()
  })
});

const calendarSummarySchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12)
  })
});

const queueBoardSchema = z.object({
  query: z.object({
    doctorId: z.coerce.number().int().positive().optional(),
    consultationType: z.string().optional(),
    date: z.coerce.date().optional()
  })
});

const queueLogSchema = z.object({
  query: z.object({
    doctorId: z.coerce.number().int().positive().optional(),
    consultationType: z.string().optional(),
    action: z.enum(['Skipped', 'Recalled']).optional(),
    search: z.string().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
});

// Assuming authentication is required for all these routes
router.use(requireAuth);

// Static-segment routes must be registered before the generic '/' list route's siblings
// that share a depth with any future '/:id' route, per this project's route-ordering convention.
router.get('/stats', appointmentsController.getStats);
router.get('/today-schedule', appointmentsController.getTodaysSchedule);
router.get('/calendar', validate(calendarSummarySchema), appointmentsController.getCalendarSummary);
router.get('/queue', appointmentsController.getLiveQueue);
router.get('/queue/stats', appointmentsController.getQueueStats);
router.get('/board', validate(queueBoardSchema), appointmentsController.getQueueBoard);
router.get('/queue-log', validate(queueLogSchema), appointmentsController.listQueueLog);
router.get('/skip-stats', validate(skipStatsSchema), appointmentsController.getSkipStats);
router.get('/doctors', appointmentsController.getDoctors);
router.get('/availability', validate(availabilitySchema), appointmentsController.getAvailability);
router.get('/list', validate(listAppointmentsSchema), appointmentsController.listAppointments);

router.post('/', validate(createAppointmentSchema), appointmentsController.createAppointment);
router.get('/', appointmentsController.getAllAppointments);
router.patch('/:id/status', validate(updateStatusSchema), appointmentsController.updateStatus);
router.patch('/:id/time', validate(updateTimeSchema), appointmentsController.updateTime);
router.patch('/:id/skip', validate(skipSchema), appointmentsController.skipAppointment);

export { router as appointmentsRouter };
