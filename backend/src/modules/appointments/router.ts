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
<<<<<<< Updated upstream
    reason: z.string().optional()
  })
=======
    reason: z.string().optional(),
  }),
>>>>>>> Stashed changes
});

const updateStatusSchema = z.object({
  body: z.object({
<<<<<<< Updated upstream
    status: z.enum(APPOINTMENT_STATUSES)
=======
    // Extended beyond the original queue statuses to also cover the
    // Appointments UI's Cancelled / No Show states. Still a plain string
    // column in the DB, so no migration is needed for this change.
    status: z.enum(['Waiting', 'Called', 'Consulting', 'Completed', 'Skipped', 'Cancelled', 'No Show']),
>>>>>>> Stashed changes
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  }),
});

const updateTimeSchema = z.object({
  body: z.object({
    scheduled_at: z.string().datetime({ message: 'Must be a valid ISO datetime' }),
  }),
  params: z.object({
    id: z.string().transform((val) => parseInt(val, 10)),
  }),
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
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional()
  })
});

const calendarSummarySchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12)
  })
});

// Assuming authentication is required for all these routes
router.use(requireAuth);

<<<<<<< Updated upstream
// Static-segment routes must be registered before the generic '/' list route's siblings
// that share a depth with any future '/:id' route, per this project's route-ordering convention.
router.get('/stats', appointmentsController.getStats);
router.get('/today-schedule', appointmentsController.getTodaysSchedule);
router.get('/calendar', validate(calendarSummarySchema), appointmentsController.getCalendarSummary);
=======
router.post('/', validate(createAppointmentSchema), appointmentsController.createAppointment);
router.get('/stats', appointmentsController.getStats);
>>>>>>> Stashed changes
router.get('/queue', appointmentsController.getLiveQueue);
router.get('/queue/stats', appointmentsController.getQueueStats);
router.get('/doctors', appointmentsController.getDoctors);
<<<<<<< Updated upstream
router.get('/list', validate(listAppointmentsSchema), appointmentsController.listAppointments);

router.post('/', validate(createAppointmentSchema), appointmentsController.createAppointment);
=======
router.get('/calendar-summary', appointmentsController.getCalendarSummary);
router.get('/today-schedule', appointmentsController.getTodaysSchedule);
>>>>>>> Stashed changes
router.get('/', appointmentsController.getAllAppointments);
router.get('/:id', appointmentsController.getAppointmentById);
router.patch('/:id/status', validate(updateStatusSchema), appointmentsController.updateStatus);
router.patch('/:id/time', validate(updateTimeSchema), appointmentsController.updateTime);
<<<<<<< Updated upstream
router.patch('/:id/skip', validate(skipSchema), appointmentsController.skipAppointment);
=======
router.delete('/:id', appointmentsController.deleteAppointment);
>>>>>>> Stashed changes

export { router as appointmentsRouter };