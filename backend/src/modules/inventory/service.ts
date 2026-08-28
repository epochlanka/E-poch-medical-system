import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

const DEFAULT_EXPIRY_THRESHOLD_DAYS = 90;
const STOCK_TAKE_REVIEW_THRESHOLD_PCT = 0.1;

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

// Batches aren't a document-status workflow — they move through a lifecycle of
// Received -> Active (on-hand > 0) -> Depleted/Expired, tracked implicitly rather than
// via an explicit status field (Section 8 Status Flow).
const batchLifecycleStatus = (qtyOnHand: number, expiryDate: Date, now = new Date()) => {
  if (expiryDate < now) return 'Expired';
  if (qtyOnHand <= 0) return 'Depleted';
  return 'Active';
};

// ---- Batch & Expiry Tracking -------------------------------------------------

interface ListBatchesFilters {
  medicineId?: number;
  supplierId?: number;
  batchNo?: string;
  status?: 'Active' | 'Depleted' | 'Expired' | 'Expiring';
  expiryFrom?: Date;
  expiryTo?: Date;
  page?: number;
  limit?: number;
}

export const listBatches = async (filters: ListBatchesFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 50;

  const now = new Date();
  const expiryFilter: Prisma.DateTimeFilter = {};
  if (filters.expiryFrom) expiryFilter.gte = filters.expiryFrom;
  if (filters.expiryTo) expiryFilter.lte = filters.expiryTo;
  if (filters.status === 'Expired') expiryFilter.lt = now;
  if (filters.status === 'Expiring') {
    expiryFilter.gte = now;
    expiryFilter.lte = addDays(now, DEFAULT_EXPIRY_THRESHOLD_DAYS);
  }

  const where: Prisma.BatchWhereInput = {
    ...(filters.medicineId ? { medicine_id: filters.medicineId } : {}),
    ...(filters.supplierId ? { supplier_id: filters.supplierId } : {}),
    ...(filters.batchNo ? { batch_no: { contains: filters.batchNo } } : {}),
    ...(Object.keys(expiryFilter).length ? { expiry_date: expiryFilter } : {}),
    ...(filters.status === 'Depleted' ? { qty_on_hand: { lte: 0 } } : {}),
    ...(filters.status === 'Expiring' ? { qty_on_hand: { gt: 0 } } : {}),
  };

  const [total, batches] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      orderBy: { expiry_date: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { medicine: { select: { medicine_id: true, name: true, reorder_level: true } }, supplier: { select: { supplier_id: true, name: true } } },
    }),
  ]);

  const data = batches.map((b) => ({
    batchId: b.batch_id,
    batchNo: b.batch_no,
    medicineId: b.medicine.medicine_id,
    medicineName: b.medicine.name,
    manufactureDate: b.manufacture_date,
    expiryDate: b.expiry_date,
    qtyOnHand: b.qty_on_hand,
    location: b.location,
    supplierId: b.supplier?.supplier_id ?? null,
    supplierName: b.supplier?.name ?? null,
    status: batchLifecycleStatus(b.qty_on_hand, b.expiry_date, now),
  }));

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getBatchById = async (batchId: number) => {
  const batch = await prisma.batch.findUnique({
    where: { batch_id: batchId },
    include: { medicine: true, supplier: true },
  });
  if (!batch) throw new NotFoundError('Batch not found');
  return batch;
};

export const getBatchLedger = async (batchId: number, page = 1, limit = 50) => {
  const [total, entries] = await Promise.all([
    prisma.stockLedger.count({ where: { batch_id: batchId } }),
    prisma.stockLedger.findMany({
      where: { batch_id: batchId },
      include: { created_by_user: { select: { username: true } } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: entries.map((e) => ({
      ledgerId: e.ledger_id,
      changeQty: e.change_qty,
      balanceAfter: e.balance_after,
      eventType: e.event_type,
      referenceType: e.reference_type,
      referenceId: e.reference_id,
      reason: e.reason,
      createdBy: e.created_by_user.username,
      createdAt: e.created_at,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ---- Manual Adjustment (reason-coded, can never go below zero) ----------------

export const adjustBatch = async (batchId: number, delta: number, reason: string, actor: Actor) => {
  if (!reason?.trim()) throw new ValidationError('A reason is required for a manual stock adjustment');
  if (delta === 0) throw new ValidationError('Adjustment quantity cannot be zero');

  const batch = await prisma.batch.findUnique({ where: { batch_id: batchId } });
  if (!batch) throw new NotFoundError('Batch not found');

  const newQty = batch.qty_on_hand + delta;
  if (newQty < 0) throw new ValidationError('Adjustment would take the batch below zero');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.batch.update({ where: { batch_id: batchId }, data: { qty_on_hand: newQty } });
    await tx.stockLedger.create({
      data: {
        batch_id: batchId,
        change_qty: delta,
        balance_after: newQty,
        event_type: 'Adjustment',
        reason,
        created_by: actor.user_id,
      },
    });
    return updated;
  });
};

// ---- Physical relocation (Stock Transfer) --------------------------------------
// A transfer here means "this batch now physically sits somewhere else" — qty_on_hand is
// unchanged, so unlike adjustBatch this doesn't write a StockLedger row (that ledger's
// change_qty/balance_after model is for quantity movements, not location metadata).

export const updateBatchLocation = async (batchId: number, location: string) => {
  if (!location?.trim()) throw new ValidationError('A location is required');
  const batch = await prisma.batch.findUnique({ where: { batch_id: batchId } });
  if (!batch) throw new NotFoundError('Batch not found');
  return prisma.batch.update({ where: { batch_id: batchId }, data: { location: location.trim() } });
};

// ---- Low-Stock / Reorder + Expiry Alerts ---------------------------------------

type Alert = {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch';
  severity: 'red' | 'amber';
  message: string;
  refId: number;
};

export const getAlerts = async (expiryThresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS) => {
  const expiryHorizon = addDays(new Date(), expiryThresholdDays);

  const [medicines, expiringBatches] = await Promise.all([
    prisma.medicine.findMany({
      where: { is_active: true },
      select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true } } },
    }),
    prisma.batch.findMany({
      where: { qty_on_hand: { gt: 0 }, expiry_date: { lte: expiryHorizon } },
      include: { medicine: { select: { name: true } } },
      orderBy: { expiry_date: 'asc' },
    }),
  ]);

  const alerts: Alert[] = [];

  for (const medicine of medicines) {
    const totalQty = medicine.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
    if (totalQty >= medicine.reorder_level) continue;
    alerts.push({
      type: 'low-stock',
      severity: totalQty === 0 ? 'red' : 'amber',
      message: `${medicine.name} is low on stock (${totalQty} on hand, reorder level ${medicine.reorder_level})`,
      refId: medicine.medicine_id,
    });
  }

  const now = new Date();
  for (const batch of expiringBatches) {
    const isExpired = batch.expiry_date < now;
    alerts.push({
      type: isExpired ? 'expired-batch' : 'expiring-batch',
      severity: isExpired ? 'red' : 'amber',
      message: `${batch.medicine.name} batch ${batch.batch_no} ${isExpired ? 'expired' : 'expires'} on ${batch.expiry_date.toISOString().slice(0, 10)}`,
      refId: batch.batch_id,
    });
  }

  return alerts;
};

// ---- Stock-Take / Physical Count -----------------------------------------------

interface StockCountItemInput {
  batch_id: number;
  counted_qty: number;
}

const isSignificantVariance = (expected: number, variance: number) => {
  if (expected === 0) return variance !== 0;
  return Math.abs(variance) / expected > STOCK_TAKE_REVIEW_THRESHOLD_PCT;
};

export const createStockCount = async (items: StockCountItemInput[], actor: Actor, notes?: string) => {
  if (items.length === 0) throw new ValidationError('A stock count must include at least one batch');

  const batches = await prisma.batch.findMany({ where: { batch_id: { in: items.map((i) => i.batch_id) } } });
  const batchById = new Map(batches.map((b) => [b.batch_id, b]));

  const missing = items.filter((i) => !batchById.has(i.batch_id));
  if (missing.length > 0) throw new ValidationError(`Unknown batch id(s): ${missing.map((i) => i.batch_id).join(', ')}`);

  const stockCount = await prisma.stockCount.create({
    data: {
      performed_by: actor.user_id,
      notes,
      items: {
        create: items.map((i) => {
          const expected = batchById.get(i.batch_id)!.qty_on_hand;
          return { batch_id: i.batch_id, expected_qty: expected, counted_qty: i.counted_qty, variance: i.counted_qty - expected };
        }),
      },
    },
    include: { items: { include: { batch: { include: { medicine: true } } } } },
  });

  const needsReview = stockCount.items.some((i) => isSignificantVariance(i.expected_qty, i.variance));
  if (needsReview) {
    return prisma.stockCount.update({
      where: { stock_count_id: stockCount.stock_count_id },
      data: { status: 'PendingReview' },
      include: { items: { include: { batch: { include: { medicine: true } } } } },
    });
  }

  return stockCount;
};

export const listStockCounts = async (status?: string) => {
  return prisma.stockCount.findMany({
    where: status ? { status } : {},
    include: { performed_by_user: { select: { username: true } }, items: true },
    orderBy: { created_at: 'desc' },
  });
};

export const getStockCountById = async (id: number) => {
  const stockCount = await prisma.stockCount.findUnique({
    where: { stock_count_id: id },
    include: {
      performed_by_user: { select: { username: true } },
      reviewed_by_user: { select: { username: true } },
      items: { include: { batch: { include: { medicine: true } } } },
    },
  });
  if (!stockCount) throw new NotFoundError('Stock count not found');
  return stockCount;
};

// Posting is what actually writes the correcting ledger rows — a stock-take is just a record
// until then. Any line beyond the variance threshold requires an Admin to be the one posting.
export const postStockCount = async (id: number, actor: Actor) => {
  const stockCount = await prisma.stockCount.findUnique({ where: { stock_count_id: id }, include: { items: true } });
  if (!stockCount) throw new NotFoundError('Stock count not found');
  if (stockCount.status === 'Posted') throw new ValidationError('This stock count has already been posted');

  const needsReview = stockCount.items.some((i) => isSignificantVariance(i.expected_qty, i.variance));
  if (needsReview && actor.role !== 'Admin') {
    throw new ForbiddenError('This stock count has variances beyond the review threshold and requires Admin approval to post');
  }

  return prisma.$transaction(async (tx) => {
    for (const item of stockCount.items) {
      if (item.variance === 0) continue;
      await tx.batch.update({ where: { batch_id: item.batch_id }, data: { qty_on_hand: item.counted_qty } });
      await tx.stockLedger.create({
        data: {
          batch_id: item.batch_id,
          change_qty: item.variance,
          balance_after: item.counted_qty,
          event_type: 'StockTakeCorrection',
          reference_type: 'StockCount',
          reference_id: String(id),
          reason: `Stock-take correction (expected ${item.expected_qty}, counted ${item.counted_qty})`,
          created_by: actor.user_id,
        },
      });
    }

    return tx.stockCount.update({
      where: { stock_count_id: id },
      data: { status: 'Posted', posted_at: new Date(), reviewed_by: needsReview ? actor.user_id : stockCount.reviewed_by },
      include: { items: { include: { batch: { include: { medicine: true } } } } },
    });
  });
};
