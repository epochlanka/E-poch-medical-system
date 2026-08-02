import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const SUPPLIER_MANAGE_ROLES = ['Admin'];
const PO_ROLES = ['Admin', 'Pharmacist'];
const DISCREPANCY_REVIEW_ROLES = ['Admin'];

const supplierIdParamsSchema = z.object({ params: z.object({ supplierId: z.coerce.number().int().positive() }) });
const poIdParamsSchema = z.object({ params: z.object({ poId: z.coerce.number().int().positive() }) });
const grnIdParamsSchema = z.object({ params: z.object({ grnId: z.coerce.number().int().positive() }) });

const listSuppliersSchema = z.object({ query: z.object({ search: z.string().optional(), includeInactive: z.string().optional() }) });

const createSupplierSchema = z.object({
  body: z.object({ name: z.string().min(1, 'Name is required'), contact: z.string().optional(), address: z.string().optional() }),
});

const updateSupplierSchema = z.object({
  params: z.object({ supplierId: z.coerce.number().int().positive() }),
  body: z.object({ name: z.string().min(1).optional(), contact: z.string().optional(), address: z.string().optional(), is_active: z.boolean().optional() }),
});

const poItemSchema = z.object({ medicine_id: z.number().int().positive(), qty_ordered: z.number().int().positive(), unit_cost: z.number().min(0).optional() });

const createPoSchema = z.object({
  body: z.object({
    supplier_id: z.number().int().positive(),
    order_date: z.coerce.date().optional(),
    items: z.array(poItemSchema).min(1, 'A purchase order must include at least one item'),
  }),
});

const listPoSchema = z.object({
  query: z.object({
    supplierId: z.coerce.number().int().positive().optional(),
    status: z.enum(['Draft', 'Submitted', 'PartiallyReceived', 'Received', 'Closed']).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
});

const grnItemSchema = z.object({
  po_item_id: z.number().int().positive(),
  qty_received: z.number().int().positive(),
  batch_no: z.string().min(1, 'Batch number is required'),
  expiry_date: z.coerce.date(),
  manufacture_date: z.coerce.date().optional(),
});

const receiveGrnSchema = z.object({
  params: z.object({ poId: z.coerce.number().int().positive() }),
  body: z.object({ items: z.array(grnItemSchema).min(1, 'A GRN must include at least one item') }),
});

const listGrnsSchema = z.object({ query: z.object({ hasDiscrepancy: z.string().optional(), reviewed: z.string().optional() }) });

const reviewDiscrepancySchema = z.object({
  params: z.object({ grnId: z.coerce.number().int().positive() }),
  body: z.object({ notes: z.string().optional() }),
});

// Static-segment routes (/purchase-orders, /goods-received-notes) must be registered before
// the generic /:supplierId route, or Express will swallow them as if they were a supplier id.

// Purchase Orders
router.get('/purchase-orders/suggest-reorder', requireRole(READ_ROLES), controller.suggestReorder);
router.get('/purchase-orders', requireRole(READ_ROLES), validate(listPoSchema), controller.listPurchaseOrders);
router.post('/purchase-orders', requireRole(PO_ROLES), validate(createPoSchema), controller.createPurchaseOrder);
router.get('/purchase-orders/:poId', requireRole(READ_ROLES), validate(poIdParamsSchema), controller.getPurchaseOrderById);
router.post('/purchase-orders/:poId/submit', requireRole(PO_ROLES), validate(poIdParamsSchema), controller.submitPurchaseOrder);
router.post('/purchase-orders/:poId/close', requireRole(PO_ROLES), validate(poIdParamsSchema), controller.closePurchaseOrder);
router.post('/purchase-orders/:poId/grn', requireRole(PO_ROLES), validate(receiveGrnSchema), controller.receiveGrn);

// Goods Received Notes / Discrepancy Review
router.get('/goods-received-notes', requireRole(READ_ROLES), validate(listGrnsSchema), controller.listGrns);
router.get('/goods-received-notes/:grnId', requireRole(READ_ROLES), validate(grnIdParamsSchema), controller.getGrnById);
router.post('/goods-received-notes/:grnId/review-discrepancy', requireRole(DISCREPANCY_REVIEW_ROLES), validate(reviewDiscrepancySchema), controller.reviewDiscrepancy);

// Supplier Directory (generic /:supplierId last, so it never shadows the static routes above)
router.get('/', requireRole(READ_ROLES), validate(listSuppliersSchema), controller.listSuppliers);
router.post('/', requireRole(SUPPLIER_MANAGE_ROLES), validate(createSupplierSchema), controller.createSupplier);
router.get('/:supplierId', requireRole(READ_ROLES), validate(supplierIdParamsSchema), controller.getSupplierById);
router.put('/:supplierId', requireRole(SUPPLIER_MANAGE_ROLES), validate(updateSupplierSchema), controller.updateSupplier);

export default router;
