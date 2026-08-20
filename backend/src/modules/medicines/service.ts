import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

interface SearchMedicinesParams {
  search?: string;
  category?: string;
  includeInactive?: boolean;
}

const EXPIRY_SOON_DAYS = 90;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

type BatchStockRow = { qty_on_hand: number; expiry_date: Date };

// Shared by the prescription-builder search and the Pharmacy/Medicine Stock tables so
// "in stock"/"low"/"expiring soon" always means the same thing everywhere it's shown.
// nearestExpiry looks across ALL valid future batches (not just the expiry-soon window) so
// pages that display a plain "Expiry Date" column still get a value beyond the 90-day cutoff;
// isExpiringSoon stays gated to the window for the alerting/tab-filter use case.
const deriveStock = (batches: BatchStockRow[], reorderLevel: number, now = new Date()) => {
  const totalQty = batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
  const validBatches = batches.filter((b) => b.qty_on_hand > 0 && b.expiry_date > now);
  const hasValidStock = validBatches.length > 0;
  const stockStatus: 'out-of-stock' | 'low' | 'in-stock' = !hasValidStock ? 'out-of-stock' : totalQty < reorderLevel ? 'low' : 'in-stock';

  const nearestExpiry = validBatches.length
    ? validBatches.reduce((min, b) => (b.expiry_date < min ? b.expiry_date : min), validBatches[0].expiry_date)
    : null;
  const expiryHorizon = addDays(now, EXPIRY_SOON_DAYS);
  const isExpiringSoon = nearestExpiry !== null && nearestExpiry <= expiryHorizon;

  return { totalQty, stockStatus, isExpiringSoon, nearestExpiry };
};

// Stock Management's "Location" column: a medicine has no location of its own — it's wherever
// its batches physically sit. Report the location holding the most stock (the shelf a
// pharmacist would actually go to), "Multiple" if batches disagree, or null if unset/no stock.
const primaryLocation = (batches: { qty_on_hand: number; location: string | null }[]) => {
  const located = batches.filter((b) => b.qty_on_hand > 0 && b.location);
  if (located.length === 0) return null;
  const distinct = new Set(located.map((b) => b.location));
  if (distinct.size > 1) return 'Multiple';
  const top = located.reduce((max, b) => (b.qty_on_hand > max.qty_on_hand ? b : max), located[0]);
  return top.location;
};

// Real-time stock status the Prescription Builder shows per line (FR-040) — computed live
// from the same batch data the pharmacist will allocate from at dispense time, never cached.
export const searchMedicines = async (params: SearchMedicinesParams) => {
  const where: Prisma.MedicineWhereInput = {};
  if (!params.includeInactive) where.is_active = true;
  if (params.category) where.category = params.category;

  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term } },
      { generic_name: { contains: term } },
      { brand_name: { contains: term } },
      { category: { contains: term } },
      { form: { contains: term } },
      { strength: { contains: term } },
      { barcode: { contains: term } },
    ];
  }

  const medicines = await prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { batches: { select: { qty_on_hand: true, expiry_date: true } } },
    take: 50,
  });

  const now = new Date();
  return medicines.map((m) => {
    const { totalQty, stockStatus } = deriveStock(m.batches, m.reorder_level, now);

    return {
      medicine_id: m.medicine_id,
      name: m.name,
      generic_name: m.generic_name,
      brand_name: m.brand_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      unit: m.unit,
      unit_price: m.unit_price,
      barcode: m.barcode,
      is_active: m.is_active,
      stockStatus,
      totalQty,
    };
  });
};

export type MedicineStockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon';

interface ListMedicineStockParams {
  search?: string;
  category?: string;
  status?: MedicineStockStatus;
  supplierId?: number;
  page?: number;
  limit?: number;
}

// Powers the Pharmacy and Medicine Stock tables (FR-052-ish stock overview): unlike
// searchMedicines (autocomplete, take 50, no pagination), this always paginates and
// supports filtering by stock/expiry/supplier, since the whole catalog can be a few thousand rows.
export const listMedicineStock = async (params: ListMedicineStockParams) => {
  const where: Prisma.MedicineWhereInput = { is_active: true };
  if (params.category) where.category = params.category;
  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term } },
      { generic_name: { contains: term } },
      { category: { contains: term } },
      { barcode: { contains: term } },
    ];
  }
  // A medicine has no direct supplier — it's sourced through whichever batches were received
  // from a given supplier — so "filter by supplier" means "has at least one batch from them".
  if (params.supplierId) where.batches = { some: { supplier_id: params.supplierId } };

  const medicines = await prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { batches: { select: { qty_on_hand: true, expiry_date: true, location: true } } },
  });

  const now = new Date();
  let rows = medicines.map((m) => {
    const { totalQty, stockStatus, isExpiringSoon, nearestExpiry } = deriveStock(m.batches, m.reorder_level, now);
    return {
      medicine_id: m.medicine_id,
      name: m.name,
      generic_name: m.generic_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      unit: m.unit,
      reorder_level: m.reorder_level,
      max_stock_level: m.max_stock_level,
      buy_price: m.buy_price,
      sell_price: m.unit_price,
      barcode: m.barcode,
      is_active: m.is_active,
      totalQty,
      stockStatus,
      isExpiringSoon,
      nearestExpiry,
      location: primaryLocation(m.batches),
    };
  });

  if (params.status === 'in-stock') rows = rows.filter((r) => r.stockStatus === 'in-stock');
  else if (params.status === 'low-stock') rows = rows.filter((r) => r.stockStatus === 'low');
  else if (params.status === 'out-of-stock') rows = rows.filter((r) => r.stockStatus === 'out-of-stock');
  else if (params.status === 'expiring-soon') rows = rows.filter((r) => r.isExpiringSoon);

  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 && params.limit <= 200 ? params.limit : 8;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const data = rows.slice((page - 1) * limit, page * limit);

  return { data, pagination: { page, limit, total, totalPages } };
};

// Stat cards + "Expiring Soon"/"Top Low Stock" panels on the Pharmacy and Medicine Stock dashboards.
export const getMedicineStats = async () => {
  const medicines = await prisma.medicine.findMany({
    where: { is_active: true },
    select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true, expiry_date: true } } },
  });

  const now = new Date();
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let expiringSoon = 0;
  const lowStockList: { medicineId: number; medicineName: string; totalQty: number; reorderLevel: number }[] = [];

  for (const m of medicines) {
    const { totalQty, stockStatus, isExpiringSoon } = deriveStock(m.batches, m.reorder_level, now);
    if (stockStatus === 'in-stock') inStock += 1;
    else if (stockStatus === 'low') {
      lowStock += 1;
      lowStockList.push({ medicineId: m.medicine_id, medicineName: m.name, totalQty, reorderLevel: m.reorder_level });
    } else outOfStock += 1;
    if (isExpiringSoon) expiringSoon += 1;
  }

  // Worst shortfall (as a share of its own reorder level) first, so a near-empty fast-mover
  // outranks a big-catalog item that's only marginally under its threshold.
  lowStockList.sort((a, b) => a.totalQty / Math.max(a.reorderLevel, 1) - b.totalQty / Math.max(b.reorderLevel, 1));

  const expiryHorizon = addDays(now, EXPIRY_SOON_DAYS);
  const expiringBatches = await prisma.batch.findMany({
    where: { qty_on_hand: { gt: 0 }, expiry_date: { gte: now, lte: expiryHorizon } },
    include: { medicine: { select: { medicine_id: true, name: true } } },
    orderBy: { expiry_date: 'asc' },
    take: 6,
  });

  return {
    totalMedicines: medicines.length,
    inStock,
    lowStock,
    outOfStock,
    expiringSoon,
    expiringList: expiringBatches.map((b) => ({
      medicineId: b.medicine.medicine_id,
      medicineName: b.medicine.name,
      expiryDate: b.expiry_date,
      qty: b.qty_on_hand,
    })),
    lowStockList: lowStockList.slice(0, 6),
  };
};

export const getMedicineById = (medicineId: number) => prisma.medicine.findUnique({ where: { medicine_id: medicineId } });

interface CreateMedicineInput {
  name: string;
  generic_name?: string;
  brand_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  unit: string;
  reorder_level?: number;
  max_stock_level?: number;
  unit_price?: number;
  buy_price?: number;
  barcode?: string;
}

// The parent record every batch, prescription line, and dispense event ultimately references.
export const createMedicine = async (input: CreateMedicineInput) => {
  if (input.barcode) {
    const existing = await prisma.medicine.findUnique({ where: { barcode: input.barcode } });
    if (existing) throw new ValidationError('A medicine with this barcode already exists');
  }
  return prisma.medicine.create({ data: input });
};

interface UpdateMedicineInput {
  name?: string;
  generic_name?: string;
  brand_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  unit?: string;
  reorder_level?: number;
  max_stock_level?: number;
  unit_price?: number;
  buy_price?: number;
  barcode?: string;
  is_active?: boolean;
}

export const updateMedicine = async (medicineId: number, updates: UpdateMedicineInput) => {
  const existing = await prisma.medicine.findUnique({ where: { medicine_id: medicineId } });
  if (!existing) throw new NotFoundError('Medicine not found');

  if (updates.barcode && updates.barcode !== existing.barcode) {
    const clash = await prisma.medicine.findUnique({ where: { barcode: updates.barcode } });
    if (clash) throw new ValidationError('A medicine with this barcode already exists');
  }

  return prisma.medicine.update({ where: { medicine_id: medicineId }, data: updates });
};
