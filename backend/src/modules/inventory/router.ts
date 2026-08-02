import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const WRITE_ROLES = ['Admin', 'Pharmacist'];

const listBatchesSchema = z.object({
  query: z.object({
    medicineId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    batchNo: z.string().optional(),
    status: z.enum(['Active', 'Depleted', 'Expired', 'Expiring']).optional(),
    expiryFrom: z.coerce.date().optional(),
    expiryTo: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const batchIdParamsSchema = z.object({ params: z.object({ batchId: z.coerce.number().int().positive() }) });

const ledgerSchema = z.object({
  params: z.object({ batchId: z.coerce.number().int().positive() }),
  query: z.object({ page: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().optional() }),
});

const adjustSchema = z.object({
  params: z.object({ batchId: z.coerce.number().int().positive() }),
  body: z.object({
    delta: z.number().int().refine((n) => n !== 0, 'delta cannot be zero'),
    reason: z.string().min(1, 'A reason is required'),
  }),
});

const alertsSchema = z.object({ query: z.object({ days: z.coerce.number().int().positive().optional() }) });

const createStockCountSchema = z.object({
  body: z.object({
    items: z
      .array(z.object({ batch_id: z.number().int().positive(), counted_qty: z.number().int().min(0) }))
      .min(1, 'At least one batch is required'),
    notes: z.string().optional(),
  }),
});

const listStockCountsSchema = z.object({ query: z.object({ status: z.enum(['Draft', 'PendingReview', 'Posted']).optional() }) });
const stockCountIdParamsSchema = z.object({ params: z.object({ stockCountId: z.coerce.number().int().positive() }) });

router.get('/batches', requireRole(READ_ROLES), validate(listBatchesSchema), controller.listBatches);
router.get('/batches/:batchId', requireRole(READ_ROLES), validate(batchIdParamsSchema), controller.getBatchById);
router.get('/batches/:batchId/ledger', requireRole(READ_ROLES), validate(ledgerSchema), controller.getBatchLedger);
router.post('/batches/:batchId/adjust', requireRole(WRITE_ROLES), validate(adjustSchema), controller.adjustBatch);

router.get('/alerts', requireRole(READ_ROLES), validate(alertsSchema), controller.alerts);

router.get('/stock-counts', requireRole(READ_ROLES), validate(listStockCountsSchema), controller.listStockCounts);
router.post('/stock-counts', requireRole(WRITE_ROLES), validate(createStockCountSchema), controller.createStockCount);
router.get('/stock-counts/:stockCountId', requireRole(READ_ROLES), validate(stockCountIdParamsSchema), controller.getStockCountById);
router.post('/stock-counts/:stockCountId/post', requireRole(WRITE_ROLES), validate(stockCountIdParamsSchema), controller.postStockCount);

export default router;
