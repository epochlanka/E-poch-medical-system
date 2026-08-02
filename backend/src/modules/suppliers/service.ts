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

export const listSuppliers = async (filters: ListSuppliersFilters) => {
  const where: Prisma.SupplierWhereInput = {};
  if (!filters.includeInactive) where.is_active = true;
  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [{ name: { contains: term } }, { contact: { contains: term } }];
  }
  return prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
};

interface CreateSupplierInput {
  name: string;
  contact?: string;
  address?: string;
}

export const createSupplier = (input: CreateSupplierInput) => prisma.supplier.create({ data: input });

interface UpdateSupplierInput {
  name?: string;
  contact?: string;
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
      created_by: actor.user_id,
      items: { create: input.items.map((i) => ({ medicine_id: i.medicine_id, qty_ordered: i.qty_ordered, unit_cost: i.unit_cost })) },
    },
    include: { items: { include: { medicine: true } }, supplier: true },
  });
};

interface ListPoFilters {
  supplierId?: number;
  status?: string;
  page?: number;
  limit?: number;
}

export const listPurchaseOrders = async (filters: ListPoFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (filters.supplierId) where.supplier_id = filters.supplierId;
  if (filters.status) where.status = filters.status;

  const [total, orders] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { order_date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { supplier: { select: { supplier_id: true, name: true } }, items: true },
    }),
  ]);

  return { data: orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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
  return po;
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
