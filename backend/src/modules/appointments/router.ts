import { Router } from 'express';
import { z } from 'zod';
import { appointmentsController } from './controller';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';

const router = Router();

const createAppointmentSchema = z.object({
  body: z.object({
    patient_id: z.string().min(1, 'Patient ID is required'),
    doctor_id: z.number().positive('Doctor ID is required'),
    scheduled_at: z.string().datetime({ message: 'Must be a valid ISO datetime' })
  })
});

const updateStatusSchema = z.object({
  body: z.object({
    status: z.enum(['Waiting', 'Called', 'Consulting', 'Completed', 'Skipped'])
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

// Assuming authentication is required for all these routes
router.use(requireAuth);

router.post('/', validate(createAppointmentSchema), appointmentsController.createAppointment);
router.get('/queue', appointmentsController.getLiveQueue);
router.get('/doctors', appointmentsController.getDoctors);
router.get('/', appointmentsController.getAllAppointments);
router.patch('/:id/status', validate(updateStatusSchema), appointmentsController.updateStatus);
router.patch('/:id/time', validate(updateTimeSchema), appointmentsController.updateTime);

export { router as appointmentsRouter };
