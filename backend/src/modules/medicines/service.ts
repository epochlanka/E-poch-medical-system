import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from './errors';
import { receiveStockBatch, ReceiveStockInput } from '../suppliers/service';
import { NotFoundError as SupplierNotFoundError, ValidationError as SupplierValidationError } from '../suppliers/errors';


interface Actor {
  user_id: number;
  role: string;
}

// Every module in this codebase defines its own NotFoundError/ValidationError (see errors.ts in
// each module) rather than sharing one base class, so an error thrown by suppliers/service.ts
// isn't recognized by `instanceof` in this module's controller — without this translation it
// would fall through to a generic 500 instead of the 400/404 the caller actually earned.
const runReceiveStockBatch = async (input: ReceiveStockInput, actor: Actor) => {
  try {
    return await receiveStockBatch(input, actor);
  } catch (err) {
    if (err instanceof SupplierValidationError) throw new ValidationError(err.message);
    if (err instanceof SupplierNotFoundError) throw new NotFoundError(err.message);
    throw err;
  }
};

interface SearchMedicinesParams {
  search?: string;
  category?: string;
  includeInactive?: boolean;
}

const EXPIRY_SOON_DAYS = 90;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

type BatchStockRow = { qty_on_hand: number; expiry_date: Date; cost_per_base_unit: number; selling_price_per_base_unit: number };

// Shared by the prescription-builder search and the Pharmacy/Medicine Stock tables so
// "in stock"/"low"/"expiring soon" always means the same thing everywhere it's shown.
// nearestExpiry/effectiveSellingPrice are derived FEFO-first (earliest-expiry valid batch) —
// the same batch that will actually be drawn from at dispense time — so the price shown here is
// never a fiction unrelated to what a sale would actually charge. stockValue always uses the
// batch's own frozen cost_per_base_unit (never the selling price), summed across every batch that
// still has stock on hand, expired or not — an expired batch is still owned inventory until
// someone explicitly writes it off via a stock transaction.
const deriveStock = (batches: BatchStockRow[], reorderLevel: number, defaultSellingPrice: number, now = new Date()) => {
  const totalQty = batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
  const validBatches = batches.filter((b) => b.qty_on_hand > 0 && b.expiry_date > now);
  const hasValidStock = validBatches.length > 0;
  const stockStatus: 'out-of-stock' | 'low' | 'in-stock' = !hasValidStock ? 'out-of-stock' : totalQty < reorderLevel ? 'low' : 'in-stock';

  const fefoSorted = [...validBatches].sort((a, b) => a.expiry_date.getTime() - b.expiry_date.getTime());
  const nearestExpiry = fefoSorted.length ? fefoSorted[0].expiry_date : null;
  const expiryHorizon = addDays(now, EXPIRY_SOON_DAYS);
  const isExpiringSoon = nearestExpiry !== null && nearestExpiry <= expiryHorizon;

  const effectiveSellingPrice = fefoSorted.length ? fefoSorted[0].selling_price_per_base_unit : defaultSellingPrice;
  const stockValue = batches.filter((b) => b.qty_on_hand > 0).reduce((sum, b) => sum + b.qty_on_hand * b.cost_per_base_unit, 0);

  return { totalQty, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue };
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

const BATCH_PRICING_SELECT = { qty_on_hand: true, expiry_date: true, cost_per_base_unit: true, selling_price_per_base_unit: true } as const;

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
    include: { batches: { select: BATCH_PRICING_SELECT } },
    take: 50,
  });

  const now = new Date();
  return medicines.map((m) => {
    const { totalQty, stockStatus, effectiveSellingPrice } = deriveStock(m.batches, m.reorder_level, m.default_selling_price, now);

    return {
      medicine_id: m.medicine_id,
      name: m.name,
      generic_name: m.generic_name,
      brand_name: m.brand_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      base_unit: m.base_unit,
      requires_prescription: m.requires_prescription,
      unit_price: effectiveSellingPrice, // the price a sale would actually charge right now (FEFO batch, or the fallback default if no stock)
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
  form?: string;
  brand?: string;
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
  if (params.form) where.form = params.form;
  if (params.brand) where.brand_name = params.brand;
  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term } },
      { generic_name: { contains: term } },
      { brand_name: { contains: term } },
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
    include: {
      batches: {
        select: { ...BATCH_PRICING_SELECT, location: true, batch_id: true, batch_no: true, supplier_id: true },
      },
    },
  });

  const now = new Date();
  let rows = medicines.map((m) => {
    const { totalQty, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue } = deriveStock(
      m.batches,
      m.reorder_level,
      m.default_selling_price,
      now
    );
    const activeBatchCount = m.batches.filter((b) => b.qty_on_hand > 0).length;
    return {
      medicine_id: m.medicine_id,
      name: m.name,
      brand_name: m.brand_name,
      generic_name: m.generic_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      base_unit: m.base_unit,
      default_pack_unit: m.default_pack_unit,
      default_pack_size: m.default_pack_size,
      reorder_level: m.reorder_level,
      max_stock_level: m.max_stock_level,
      sell_price: effectiveSellingPrice,
      stockValue,
      barcode: m.barcode,
      is_active: m.is_active,
      totalQty,
      batchCount: activeBatchCount,
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

// A Medicine Product plus its Stock Batches, for the inventory table's expand-to-batches view
// (Section 17) — Batches ordered FEFO (earliest expiry first), same order dispensing draws from.
export const getMedicineWithBatches = async (medicineId: number) => {
  const medicine = await prisma.medicine.findUnique({
    where: { medicine_id: medicineId },
    include: { batches: { orderBy: { expiry_date: 'asc' }, include: { supplier: { select: { supplier_id: true, name: true } } } } },
  });
  if (!medicine) throw new NotFoundError('Medicine not found');

  const now = new Date();
  const { totalQty, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue } = deriveStock(
    medicine.batches,
    medicine.reorder_level,
    medicine.default_selling_price,
    now
  );

  return {
    ...medicine,
    totalQty,
    stockStatus,
    isExpiringSoon,
    nearestExpiry,
    effectiveSellingPrice,
    stockValue,
    batches: medicine.batches.map((b) => ({
      ...b,
      status: b.expiry_date < now ? 'Expired' : b.qty_on_hand <= 0 ? 'Depleted' : 'Active',
    })),
  };
};

// Stat cards + "Expiring Soon"/"Top Low Stock" panels on the Pharmacy and Medicine Stock dashboards.
export const getMedicineStats = async () => {
  const medicines = await prisma.medicine.findMany({
    where: { is_active: true },
    select: {
      medicine_id: true,
      name: true,
      reorder_level: true,
      default_selling_price: true,
      batches: { select: BATCH_PRICING_SELECT },
    },
  });

  const now = new Date();
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let expiringSoon = 0;
  const lowStockList: { medicineId: number; medicineName: string; totalQty: number; reorderLevel: number }[] = [];

  for (const m of medicines) {
    const { totalQty, stockStatus, isExpiringSoon } = deriveStock(m.batches, m.reorder_level, m.default_selling_price, now);
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

// One bundled call for the Medicine Catalog page's KPI row + its filter dropdowns —
// same "one call per page" pattern as the dashboard overview endpoints.
export const getCatalogMeta = async () => {
  const [total, active, inactive, categories, forms, manufacturers, brands] = await Promise.all([
    prisma.medicine.count(),
    prisma.medicine.count({ where: { is_active: true } }),
    prisma.medicine.count({ where: { is_active: false } }),
    prisma.medicine.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'] }),
    prisma.medicine.findMany({ where: { form: { not: null } }, select: { form: true }, distinct: ['form'] }),
    prisma.medicine.findMany({ where: { manufacturer: { not: null } }, select: { manufacturer: true }, distinct: ['manufacturer'] }),
    prisma.medicine.findMany({ where: { brand_name: { not: null } }, select: { brand_name: true }, distinct: ['brand_name'] }),
  ]);

  return {
    stats: { total, active, inactive, therapeuticClassCount: categories.length, manufacturerCount: manufacturers.length },
    therapeuticClasses: categories.map((c) => c.category as string).sort(),
    dosageForms: forms.map((f) => f.form as string).sort(),
    manufacturers: manufacturers.map((m) => m.manufacturer as string).sort(),
    brands: brands.map((b) => b.brand_name as string).sort(),
  };
};

interface ListCatalogParams {
  search?: string;
  category?: string;
  form?: string;
  manufacturer?: string;
  brand?: string;
  batchNo?: string;
  status?: 'active' | 'inactive' | 'all';
  stockStatus?: MedicineStockStatus;
  page?: number;
  limit?: number;
}

// The full paginated/filterable catalog (search/brand/therapeutic-class/dosage-form/
// manufacturer/batch/status/stock-status) — the single "Inventory Display" table (Section 10):
// master-data fields plus the same batch-derived stock/price/expiry summary listMedicineStock
// computes, so the pharmacist never has to cross-reference two separate tables for one medicine.
// Distinct from searchMedicines (unpaginated take-50 autocomplete for pickers elsewhere).
export const listMedicineCatalog = async (params: ListCatalogParams) => {
  const where: Prisma.MedicineWhereInput = {};
  if (params.status === 'active') where.is_active = true;
  else if (params.status === 'inactive') where.is_active = false;
  if (params.category) where.category = params.category;
  if (params.form) where.form = params.form;
  if (params.manufacturer) where.manufacturer = params.manufacturer;
  if (params.brand) where.brand_name = params.brand;
  if (params.batchNo) where.batches = { some: { batch_no: { contains: params.batchNo } } };
  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term } },
      { generic_name: { contains: term } },
      { brand_name: { contains: term } },
      { barcode: { contains: term } },
    ];
  }

  const medicines = await prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { batches: { select: { ...BATCH_PRICING_SELECT, batch_no: true, location: true } } },
  });

  const now = new Date();
  let rows = medicines.map((m) => {
    const { totalQty, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue } = deriveStock(
      m.batches,
      m.reorder_level,
      m.default_selling_price,
      now
    );
    return {
      medicine_id: m.medicine_id,
      code: displayCode(m),
      name: m.name,
      generic_name: m.generic_name,
      brand_name: m.brand_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      manufacturer: m.manufacturer,
      requires_prescription: m.requires_prescription,
      base_unit: m.base_unit,
      default_pack_unit: m.default_pack_unit,
      default_pack_size: m.default_pack_size,
      default_selling_price: m.default_selling_price,
      reorder_level: m.reorder_level,
      max_stock_level: m.max_stock_level,
      barcode: m.barcode,
      is_active: m.is_active,
      totalQty,
      batchCount: m.batches.filter((b) => b.qty_on_hand > 0).length,
      sell_price: effectiveSellingPrice,
      stockValue,
      stockStatus,
      isExpiringSoon,
      nearestExpiry,
      location: primaryLocation(m.batches),
    };
  });

  if (params.stockStatus === 'in-stock') rows = rows.filter((r) => r.stockStatus === 'in-stock');
  else if (params.stockStatus === 'low-stock') rows = rows.filter((r) => r.stockStatus === 'low');
  else if (params.stockStatus === 'out-of-stock') rows = rows.filter((r) => r.stockStatus === 'out-of-stock');
  else if (params.stockStatus === 'expiring-soon') rows = rows.filter((r) => r.isExpiringSoon);

  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 && params.limit <= 200 ? params.limit : 10;
  const total = rows.length;
  const data = rows.slice((page - 1) * limit, page * limit);

  return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
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
// same file without requiring every medicine to have a barcode assigned. CSV import is Medicine
// Product master-data only — it never carries stock/batch/price data (that always goes through
// Add Stock Batch / GRN, so every batch stays auditable).
export const importMedicinesFromCsv = async (csvText: string) => {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new ValidationError('CSV must include a header row and at least one data row');

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (const required of ['name', 'base_unit']) {
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
      if (!rec.base_unit) throw new Error('Missing "base_unit"');

      const data = {
        name: rec.name,
        generic_name: rec.generic_name,
        brand_name: rec.brand_name,
        category: rec.category,
        form: rec.form,
        strength: rec.strength,
        manufacturer: rec.manufacturer,
        requires_prescription: rec.requires_prescription ? ['true', '1', 'yes'].includes(rec.requires_prescription.toLowerCase()) : undefined,
        base_unit: rec.base_unit,
        default_pack_unit: rec.default_pack_unit,
        default_pack_size: rec.default_pack_size ? Number(rec.default_pack_size) : undefined,
        default_selling_price: rec.default_selling_price ? Number(rec.default_selling_price) : undefined,
        reorder_level: rec.reorder_level ? Number(rec.reorder_level) : undefined,
        max_stock_level: rec.max_stock_level ? Number(rec.max_stock_level) : undefined,
        barcode: rec.barcode,
      };

      let existing = data.barcode ? await prisma.medicine.findUnique({ where: { barcode: data.barcode } }) : null;
      if (!existing) {
        existing = await prisma.medicine.findFirst({
          where: { name: data.name, strength: data.strength ?? null, form: data.form ?? null, brand_name: data.brand_name ?? null },
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

// Initial stock at product-creation time goes through the exact same path as "Add Stock Batch"
// (receiveStockBatch, itself backed by an auto-created PO+GRN) — a Medicine Product and its
// opening Stock Batch are always created as two separate, independently auditable records
// (Section 13), never one row wearing both hats.
type InitialStockInput = Omit<ReceiveStockInput, 'medicine_id'>;

interface CreateMedicineInput {
  name: string;
  generic_name?: string;
  brand_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  requires_prescription?: boolean;
  base_unit: string;
  default_pack_unit?: string;
  default_pack_size?: number;
  default_selling_price?: number;
  reorder_level?: number;
  max_stock_level?: number;
  barcode?: string;
  initial_stock?: InitialStockInput;
}

export const createMedicine = async (input: CreateMedicineInput, actor: Actor) => {
  if (input.barcode) {
    const existing = await prisma.medicine.findUnique({ where: { barcode: input.barcode } });
    if (existing) throw new ValidationError('A medicine with this barcode already exists');
  }
  const { initial_stock, ...medicineData } = input;

  const medicine = await prisma.medicine.create({ data: medicineData });
  if (!initial_stock) return medicine;

  // Best-effort by design: the Medicine Product is already real at this point even if its
  // opening batch fails validation — the pharmacist can add the batch separately afterward
  // rather than losing the whole product because of, say, a bad expiry date.
  await runReceiveStockBatch({ medicine_id: medicine.medicine_id, ...initial_stock }, actor);
  return medicine;
};

interface UpdateMedicineInput {
  name?: string;
  generic_name?: string;
  brand_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  requires_prescription?: boolean;
  base_unit?: string;
  default_pack_unit?: string;
  default_pack_size?: number;
  default_selling_price?: number;
  reorder_level?: number;
  max_stock_level?: number;
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

// ---- Add Stock Batch (Section 16/17): a Medicine Product already exists — this only ever
// creates a new Stock Batch for it, via the same receiveStockBatch path as initial stock. -------
export const addStockBatch = (medicineId: number, input: Omit<ReceiveStockInput, 'medicine_id'>, actor: Actor) =>
  runReceiveStockBatch({ medicine_id: medicineId, ...input }, actor);
