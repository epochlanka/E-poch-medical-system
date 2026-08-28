import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const BILLING_ROLES = ['Admin', 'Receptionist'];
const VOID_ROLES = ['Admin'];

const invoiceIdParamsSchema = z.object({ params: z.object({ invoiceId: z.coerce.number().int().positive() }) });

const createSchema = z.object({
  body: z.object({
    consultation_id: z.number().int().positive(),
    consultation_fee: z.number().min(0).optional(),
    discounts: z.array(z.object({ description: z.string().min(1), amount: z.number().positive() })).optional(),
  }),
});

const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    patientId: z.string().optional(),
    consultationId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Outstanding', 'PartiallyPaid', 'Paid', 'Voided']).optional(),
    type: z.enum(['Consultation', 'Pharmacy', 'Consultation+Pharmacy']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const paymentsSchema = z.object({
  params: z.object({ invoiceId: z.coerce.number().int().positive() }),
  body: z.object({
    payments: z.array(z.object({ method: z.enum(['Cash', 'Card', 'Mobile']), amount: z.number().positive() })).min(1),
  }),
});

const voidSchema = z.object({
  params: z.object({ invoiceId: z.coerce.number().int().positive() }),
  body: z.object({ reason: z.string().min(1, 'A void reason is required') }),
});

const reconciliationSchema = z.object({ query: z.object({ date: z.coerce.date().optional() }) });

const paymentsListSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    method: z.enum(['Cash', 'Card', 'Mobile']).optional(),
    invoiceStatus: z.enum(['Outstanding', 'PartiallyPaid', 'Paid', 'Voided']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});
const paymentsStatsSchema = z.object({ query: z.object({ range: z.enum(['month', 'quarter', 'year', 'all']).optional() }) });

router.get('/reconciliation', requireRole(['Admin', 'Receptionist']), validate(reconciliationSchema), controller.reconciliation);
router.get('/stats', requireRole(READ_ROLES), controller.stats);
// Registered before the /:invoiceId catch-all — same route-ordering rule as every other module.
router.get('/payments', requireRole(READ_ROLES), validate(paymentsListSchema), controller.payments);
router.get('/payments/stats', requireRole(READ_ROLES), validate(paymentsStatsSchema), controller.paymentsStats);

router.get('/', requireRole(READ_ROLES), validate(listSchema), controller.list);
router.post('/', requireRole(BILLING_ROLES), validate(createSchema), controller.create);
router.get('/:invoiceId', requireRole(READ_ROLES), validate(invoiceIdParamsSchema), controller.getById);
router.post('/:invoiceId/payments', requireRole(BILLING_ROLES), validate(paymentsSchema), controller.recordPayments);
router.post('/:invoiceId/void', requireRole(VOID_ROLES), validate(voidSchema), controller.voidInvoice);

export default router;
