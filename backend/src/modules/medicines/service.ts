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

// ---- Medicine Catalog (composition of the master list itself — active/inactive/classes/
// manufacturers — distinct from getMedicineStats above, which is stock-health-derived) ---------

const displayCode = (m: { medicine_id: number; barcode: string | null }) => m.barcode || `MED-${String(m.medicine_id).padStart(6, '0')}`;

// One bundled call for the Medicine Catalog page's KPI row + its three filter dropdowns —
// same "one call per page" pattern as the dashboard overview endpoints.
export const getCatalogMeta = async () => {
  const [total, active, inactive, categories, forms, manufacturers] = await Promise.all([
    prisma.medicine.count(),
    prisma.medicine.count({ where: { is_active: true } }),
    prisma.medicine.count({ where: { is_active: false } }),
    prisma.medicine.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'] }),
    prisma.medicine.findMany({ where: { form: { not: null } }, select: { form: true }, distinct: ['form'] }),
    prisma.medicine.findMany({ where: { manufacturer: { not: null } }, select: { manufacturer: true }, distinct: ['manufacturer'] }),
  ]);

  return {
    stats: { total, active, inactive, therapeuticClassCount: categories.length, manufacturerCount: manufacturers.length },
    therapeuticClasses: categories.map((c) => c.category as string).sort(),
    dosageForms: forms.map((f) => f.form as string).sort(),
    manufacturers: manufacturers.map((m) => m.manufacturer as string).sort(),
  };
};

interface ListCatalogParams {
  search?: string;
  category?: string;
  form?: string;
  manufacturer?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
}

// The full paginated/filterable catalog (search/therapeutic-class/dosage-form/manufacturer/
// status) — distinct from searchMedicines (unpaginated take-50 autocomplete for pickers
// elsewhere) and listMedicineStock (stock/batch/expiry-oriented, always active-only).
export const listMedicineCatalog = async (params: ListCatalogParams) => {
  const where: Prisma.MedicineWhereInput = {};
  if (params.status === 'active') where.is_active = true;
  else if (params.status === 'inactive') where.is_active = false;
  if (params.category) where.category = params.category;
  if (params.form) where.form = params.form;
  if (params.manufacturer) where.manufacturer = params.manufacturer;
  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term } },
      { generic_name: { contains: term } },
      { brand_name: { contains: term } },
      { barcode: { contains: term } },
    ];
  }

  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 && params.limit <= 200 ? params.limit : 10;

  const [total, medicines] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
  ]);

  return {
    data: medicines.map((m) => ({
      medicine_id: m.medicine_id,
      code: displayCode(m),
      name: m.name,
      generic_name: m.generic_name,
      brand_name: m.brand_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      manufacturer: m.manufacturer,
      unit: m.unit,
      unit_price: m.unit_price,
      buy_price: m.buy_price,
      reorder_level: m.reorder_level,
      max_stock_level: m.max_stock_level,
      barcode: m.barcode,
      is_active: m.is_active,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

// ---- CSV Import ("Import Medicines") -------------------------------------------------------
// Minimal hand-rolled parser (no CSV dependency exists in this project) — handles quoted fields
// containing commas, which is the only RFC4180 case a hand-roll needs to bother with here.
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
};

interface ImportRowResult {
  row: number;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

// Matches an existing medicine by barcode first (if the row has one), else by an exact
// name+strength+form combination — good enough to avoid duplicate rows on a re-import of the
// same file without requiring every medicine to have a barcode assigned.
export const importMedicinesFromCsv = async (csvText: string) => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new ValidationError('CSV must include a header row and at least one data row');

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const required of ['name', 'unit']) {
    if (!headers.includes(required)) throw new ValidationError(`CSV is missing required column "${required}"`);
  }

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errored = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = parseCsvLine(lines[i]);
    const rec: Record<string, string | undefined> = {};
    headers.forEach((h, idx) => (rec[h] = values[idx]?.trim() || undefined));

    try {
      if (!rec.name) throw new Error('Missing "name"');
      if (!rec.unit) throw new Error('Missing "unit"');

      const data = {
        name: rec.name,
        generic_name: rec.generic_name,
        brand_name: rec.brand_name,
        category: rec.category,
        form: rec.form,
        strength: rec.strength,
        manufacturer: rec.manufacturer,
        unit: rec.unit,
        unit_price: rec.unit_price ? Number(rec.unit_price) : undefined,
        buy_price: rec.buy_price ? Number(rec.buy_price) : undefined,
        reorder_level: rec.reorder_level ? Number(rec.reorder_level) : undefined,
        max_stock_level: rec.max_stock_level ? Number(rec.max_stock_level) : undefined,
        barcode: rec.barcode,
      };

      let existing = data.barcode ? await prisma.medicine.findUnique({ where: { barcode: data.barcode } }) : null;
      if (!existing) {
        existing = await prisma.medicine.findFirst({
          where: { name: data.name, strength: data.strength ?? null, form: data.form ?? null },
        });
      }

      if (existing) {
        await prisma.medicine.update({ where: { medicine_id: existing.medicine_id }, data });
        updated++;
        results.push({ row: rowNum, status: 'updated' });
      } else {
        await prisma.medicine.create({ data });
        created++;
        results.push({ row: rowNum, status: 'created' });
      }
    } catch (err: any) {
      errored++;
      results.push({ row: rowNum, status: 'error', message: err.message });
    }
  }

  return { created, updated, errored, results };
};

interface CreateMedicineInput {
  name: string;
  generic_name?: string;
  brand_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
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
  manufacturer?: string;
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
