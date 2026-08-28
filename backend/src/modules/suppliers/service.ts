import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

// ---- Supplier Directory ---------------------------------------------------------

interface ListSuppliersFilters {
  search?: string;
  includeInactive?: boolean;
}

type PoForSummary = {
  supplier_id: number;
  order_date: Date;
  items: { qty_ordered: number; unit_cost: number | null; grn_items: { qty_received: number }[] }[];
};

// A supplier's order/payable figures aren't stored — they're always derived live from its
// purchase orders, same "compute, don't cache" approach used for medicines' stock status and
// summarizePo() below. Kept additive to the plain Supplier row so existing callers (dropdown
// pickers in the PO/GRN modals) that only read {supplier_id, name} are unaffected.
const withSupplierTotals = <T extends { supplier_id: number; payment_terms_days: number }>(supplier: T, orders: PoForSummary[]) => {
  const now = new Date();
  let totalOrders = 0;
  let totalPayable = 0;
  let overduePayable = 0;

  for (const po of orders) {
    if (po.supplier_id !== supplier.supplier_id) continue;
    totalOrders += 1;
    const s = summarizePo(po);
    totalPayable += s.receivedAmount;
    const dueDate = new Date(po.order_date.getTime() + supplier.payment_terms_days * 86400000);
    if (s.receivedAmount > 0 && dueDate < now) overduePayable += s.receivedAmount;
  }

  return { ...supplier, totalOrders, totalPayable, overduePayable };
};

export const listSuppliers = async (filters: ListSuppliersFilters) => {
  const where: Prisma.SupplierWhereInput = {};
  if (!filters.includeInactive) where.is_active = true;
  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { name: { contains: term } },
      { contact_person: { contains: term } },
      { phone: { contains: term } },
      { email: { contains: term } },
      { city: { contains: term } },
      { contact: { contains: term } },
    ];
  }

  const [suppliers, orders] = await Promise.all([
    prisma.supplier.findMany({ where, orderBy: { name: 'asc' } }),
    prisma.purchaseOrder.findMany({ select: { supplier_id: true, order_date: true, items: { include: { grn_items: true } } } }),
  ]);

  return suppliers.map((s) => withSupplierTotals(s, orders));
};

export const getSupplierStats = async () => {
  const [totalSuppliers, activeSuppliers, suppliers, ordersThisMonth, allOrders] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where: { is_active: true } }),
    prisma.supplier.findMany({ select: { supplier_id: true, payment_terms_days: true } }),
    prisma.purchaseOrder.count({ where: { order_date: { gte: rangeStart('month') } } }),
    prisma.purchaseOrder.findMany({ select: { supplier_id: true, order_date: true, items: { include: { grn_items: true } } } }),
  ]);

  let totalPayable = 0;
  let overduePayable = 0;
  for (const s of suppliers) {
    const { totalPayable: p, overduePayable: o } = withSupplierTotals(s, allOrders);
    totalPayable += p;
    overduePayable += o;
  }

  return { totalSuppliers, activeSuppliers, totalOrdersThisMonth: ordersThisMonth, totalPayable, overduePayable };
};

interface CreateSupplierInput {
  name: string;
  contact?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  city?: string;
  payment_terms_days?: number;
  address?: string;
}

export const createSupplier = (input: CreateSupplierInput) => prisma.supplier.create({ data: input });

interface UpdateSupplierInput {
  name?: string;
  contact?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  city?: string;
  payment_terms_days?: number;
  address?: string;
  is_active?: boolean;
}

export const updateSupplier = async (supplierId: number, updates: UpdateSupplierInput) => {
  const existing = await prisma.supplier.findUnique({ where: { supplier_id: supplierId } });
  if (!existing) throw new NotFoundError('Supplier not found');
  return prisma.supplier.update({ where: { supplier_id: supplierId }, data: updates });
};

export const getSupplierById = async (supplierId: number) => {
  const supplier = await prisma.supplier.findUnique({ where: { supplier_id: supplierId } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return supplier;
};

// ---- Purchase Orders (Draft -> Submitted -> PartiallyReceived -> Received -> Closed) -----

interface PoItemInput {
  medicine_id: number;
  qty_ordered: number;
  unit_cost?: number;
}

interface CreatePoInput {
  supplier_id: number;
  order_date?: Date;
  expected_date?: Date;
  items: PoItemInput[];
}

// The PO is a commercial commitment, not a stock event — it never creates a batch by itself.
export const createPurchaseOrder = async (input: CreatePoInput, actor: Actor) => {
  if (input.items.length === 0) throw new ValidationError('A purchase order must include at least one item');

  const supplier = await prisma.supplier.findUnique({ where: { supplier_id: input.supplier_id } });
  if (!supplier) throw new NotFoundError('Supplier not found');

  return prisma.purchaseOrder.create({
    data: {
      supplier_id: input.supplier_id,
      order_date: input.order_date ?? new Date(),
      expected_date: input.expected_date,
      created_by: actor.user_id,
      items: { create: input.items.map((i) => ({ medicine_id: i.medicine_id, qty_ordered: i.qty_ordered, unit_cost: i.unit_cost })) },
    },
    include: { items: { include: { medicine: true } }, supplier: true },
  });
};

interface ListPoFilters {
  search?: string;
  supplierId?: number;
  status?: string;
  page?: number;
  limit?: number;
}

// PurchaseOrder itself has no total/received amount columns — those are always derived live
// from its items + whatever GRNs have been posted against them, same "compute, don't cache"
// approach as medicines' stock status.
const summarizePo = (po: { items: { qty_ordered: number; unit_cost: number | null; grn_items: { qty_received: number }[] }[] }) => {
  const orderedQty = po.items.reduce((s, i) => s + i.qty_ordered, 0);
  const receivedQty = po.items.reduce((s, i) => s + i.grn_items.reduce((gs, g) => gs + g.qty_received, 0), 0);
  const totalAmount = po.items.reduce((s, i) => s + i.qty_ordered * (i.unit_cost ?? 0), 0);
  const receivedAmount = po.items.reduce((s, i) => s + i.grn_items.reduce((gs, g) => gs + g.qty_received, 0) * (i.unit_cost ?? 0), 0);
  const receivedPct = orderedQty > 0 ? Math.round((receivedQty / orderedQty) * 100) : 0;
  return { orderedQty, receivedQty, receivedPct, totalAmount, receivedAmount, pendingAmount: totalAmount - receivedAmount };
};

export const listPurchaseOrders = async (filters: ListPoFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (filters.supplierId) where.supplier_id = filters.supplierId;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    const term = filters.search.trim();
    const asId = Number(term.replace(/^PO-?/i, ''));
    where.OR = [
      { supplier: { name: { contains: term } } },
      { items: { some: { medicine: { name: { contains: term } } } } },
      ...(Number.isFinite(asId) && asId > 0 ? [{ po_id: asId }] : []),
    ];
  }

  const [total, orders] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { order_date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { supplier: { select: { supplier_id: true, name: true } }, items: { include: { grn_items: true } } },
    }),
  ]);

  const data = orders.map((po) => ({ ...po, ...summarizePo(po) }));

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const rangeStart = (range?: 'month' | 'quarter' | 'year' | 'all') => {
  const now = new Date();
  if (range === 'quarter') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  if (range === 'year') return new Date(now.getFullYear(), 0, 1);
  if (range === 'all') return undefined;
  return new Date(now.getFullYear(), now.getMonth(), 1); // default: month
};

export const getPurchaseOrderStats = async (range?: 'month' | 'quarter' | 'year' | 'all') => {
  const since = rangeStart(range);
  const where: Prisma.PurchaseOrderWhereInput = since ? { order_date: { gte: since } } : {};

  const orders = await prisma.purchaseOrder.findMany({ where, include: { items: { include: { grn_items: true } } } });

  let completed = 0;
  let pending = 0;
  let partiallyReceived = 0;
  let cancelled = 0;
  let totalAmount = 0;
  let receivedAmount = 0;

  for (const po of orders) {
    if (po.status === 'Received' || po.status === 'Closed') completed += 1;
    else if (po.status === 'Submitted') pending += 1;
    else if (po.status === 'PartiallyReceived') partiallyReceived += 1;
    else if (po.status === 'Cancelled') cancelled += 1;

    const s = summarizePo(po);
    totalAmount += s.totalAmount;
    receivedAmount += s.receivedAmount;
  }

  return {
    totalOrders: orders.length,
    completed,
    pending,
    partiallyReceived,
    cancelled,
    totalAmount,
    receivedAmount,
    pendingAmount: totalAmount - receivedAmount,
  };
};

export const getTopSuppliers = async (range?: 'month' | 'quarter' | 'year' | 'all', limit = 5) => {
  const since = rangeStart(range);
  const where: Prisma.PurchaseOrderWhereInput = since ? { order_date: { gte: since } } : {};

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: { supplier: { select: { supplier_id: true, name: true } }, items: { include: { grn_items: true } } },
  });

  const bySupplier = new Map<number, { supplierId: number; supplierName: string; orderCount: number; totalAmount: number }>();
  for (const po of orders) {
    const entry = bySupplier.get(po.supplier_id) ?? { supplierId: po.supplier_id, supplierName: po.supplier.name, orderCount: 0, totalAmount: 0 };
    entry.orderCount += 1;
    entry.totalAmount += summarizePo(po).totalAmount;
    bySupplier.set(po.supplier_id, entry);
  }

  return Array.from(bySupplier.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
};

export const getPurchaseOrderById = async (poId: number) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { po_id: poId },
    include: {
      supplier: true,
      items: { include: { medicine: true, grn_items: true } },
      grns: { include: { items: true } },
    },
  });
  if (!po) throw new NotFoundError('Purchase order not found');
  return { ...po, ...summarizePo(po) };
};

export const submitPurchaseOrder = async (poId: number) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { po_id: poId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'Draft') throw new ValidationError('Only a Draft purchase order can be submitted');
  return prisma.purchaseOrder.update({ where: { po_id: poId }, data: { status: 'Submitted' } });
};

export const closePurchaseOrder = async (poId: number) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { po_id: poId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'Received') throw new ValidationError('Only a fully Received purchase order can be closed');
  return prisma.purchaseOrder.update({ where: { po_id: poId }, data: { status: 'Closed' } });
};

// Cancellable only before any stock has actually moved against it — once a GRN exists
// (PartiallyReceived/Received/Closed) the commercial commitment has already been acted on.
export const cancelPurchaseOrder = async (poId: number) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { po_id: poId } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (!['Draft', 'Submitted'].includes(po.status)) {
    throw new ValidationError('Only a Draft or Submitted purchase order can be cancelled');
  }
  return prisma.purchaseOrder.update({ where: { po_id: poId }, data: { status: 'Cancelled' } });
};

// Auto-suggests reorder quantities from medicines currently flagged low-stock (FR-067) —
// target is 2x the reorder level, a simple, defensible restock heuristic.
export const suggestReorder = async () => {
  const medicines = await prisma.medicine.findMany({
    where: { is_active: true },
    select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true } } },
  });

  return medicines
    .map((m) => {
      const currentQty = m.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
      const target = m.reorder_level * 2;
      return { medicineId: m.medicine_id, medicineName: m.name, currentQty, reorderLevel: m.reorder_level, suggestedQty: Math.max(0, target - currentQty) };
    })
    .filter((m) => m.suggestedQty > 0);
};

// ---- Goods Received Notes (the only path by which new stock enters the system) -----------

interface GrnItemInput {
  po_item_id: number;
  qty_received: number;
  batch_no: string;
  expiry_date: Date;
  manufacture_date?: Date;
}

export const receiveGrn = async (poId: number, items: GrnItemInput[], actor: Actor) => {
  if (items.length === 0) throw new ValidationError('A GRN must include at least one item');

  const po = await prisma.purchaseOrder.findUnique({ where: { po_id: poId }, include: { items: true } });
  if (!po) throw new NotFoundError('Purchase order not found');
  if (!['Submitted', 'PartiallyReceived'].includes(po.status)) {
    throw new ValidationError(`Cannot receive goods against a purchase order with status ${po.status}`);
  }

  const poItemById = new Map(po.items.map((i) => [i.po_item_id, i]));
  for (const item of items) {
    if (!poItemById.has(item.po_item_id)) throw new ValidationError(`po_item_id ${item.po_item_id} does not belong to this purchase order`);
  }

  return prisma.$transaction(async (tx) => {
    const grn = await tx.goodsReceivedNote.create({ data: { po_id: poId, received_by: actor.user_id } });
    let hasDiscrepancy = false;

    for (const item of items) {
      const poItem = poItemById.get(item.po_item_id)!;

      const priorReceived = await tx.gRNItem.aggregate({ _sum: { qty_received: true }, where: { po_item_id: item.po_item_id } });
      const totalReceived = (priorReceived._sum.qty_received ?? 0) + item.qty_received;
      if (totalReceived !== poItem.qty_ordered) hasDiscrepancy = true;

      // Accepted as its own batch record even if the batch/expiry differs from what was
      // ordered — the GRN never has to match the PO line to be valid (Edge Case, Section 9).
      const batch = await tx.batch.create({
        data: {
          medicine_id: poItem.medicine_id,
          batch_no: item.batch_no,
          manufacture_date: item.manufacture_date,
          expiry_date: item.expiry_date,
          qty_on_hand: item.qty_received,
          supplier_id: po.supplier_id,
        },
      });

      await tx.gRNItem.create({ data: { grn_id: grn.grn_id, po_item_id: item.po_item_id, batch_id: batch.batch_id, qty_received: item.qty_received } });

      await tx.stockLedger.create({
        data: {
          batch_id: batch.batch_id,
          change_qty: item.qty_received,
          balance_after: item.qty_received,
          event_type: 'GRN',
          reference_type: 'GRN',
          reference_id: String(grn.grn_id),
          created_by: actor.user_id,
        },
      });
    }

    if (hasDiscrepancy) {
      await tx.goodsReceivedNote.update({ where: { grn_id: grn.grn_id }, data: { has_discrepancy: true } });
    }

    const allPoItems = await tx.purchaseOrderItem.findMany({ where: { po_id: poId }, include: { grn_items: true } });
    const fullyReceived = allPoItems.every((pi) => pi.grn_items.reduce((s, g) => s + g.qty_received, 0) >= pi.qty_ordered);
    const anyReceived = allPoItems.some((pi) => pi.grn_items.length > 0);
    await tx.purchaseOrder.update({
      where: { po_id: poId },
      data: { status: fullyReceived ? 'Received' : anyReceived ? 'PartiallyReceived' : po.status },
    });

    return tx.goodsReceivedNote.findUnique({
      where: { grn_id: grn.grn_id },
      include: { items: { include: { batch: true, po_item: { include: { medicine: true } } } }, purchase_order: { include: { supplier: true } } },
    });
  });
};

export const getGrnById = async (grnId: number) => {
  const grn = await prisma.goodsReceivedNote.findUnique({
    where: { grn_id: grnId },
    include: {
      items: { include: { batch: true, po_item: { include: { medicine: true } } } },
      purchase_order: { include: { supplier: true } },
      receiver: { select: { username: true } },
      reviewer: { select: { username: true } },
    },
  });
  if (!grn) throw new NotFoundError('Goods received note not found');
  return grn;
};

interface ListGrnFilters {
  hasDiscrepancy?: boolean;
  reviewed?: boolean;
}

export const listGrns = async (filters: ListGrnFilters) => {
  const where: Prisma.GoodsReceivedNoteWhereInput = {};
  if (filters.hasDiscrepancy !== undefined) where.has_discrepancy = filters.hasDiscrepancy;
  if (filters.reviewed !== undefined) where.discrepancy_reviewed_by = filters.reviewed ? { not: null } : null;

  return prisma.goodsReceivedNote.findMany({
    where,
    include: { purchase_order: { include: { supplier: true } }, receiver: { select: { username: true } } },
    orderBy: { received_at: 'desc' },
  });
};

// A human always decides on a discrepancy — the system only ever flags it (FR-069).
export const reviewDiscrepancy = async (grnId: number, actor: Actor, notes?: string) => {
  const grn = await prisma.goodsReceivedNote.findUnique({ where: { grn_id: grnId } });
  if (!grn) throw new NotFoundError('Goods received note not found');
  if (!grn.has_discrepancy) throw new ValidationError('This GRN has no discrepancy to review');
  if (grn.discrepancy_reviewed_by) throw new ValidationError('This discrepancy has already been reviewed');

  return prisma.goodsReceivedNote.update({
    where: { grn_id: grnId },
    data: { discrepancy_reviewed_by: actor.user_id, discrepancy_reviewed_at: new Date(), discrepancy_notes: notes ?? grn.discrepancy_notes },
  });
};
