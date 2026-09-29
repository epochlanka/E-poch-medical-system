import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownedQty, usableBatches, usableQty, stockStatusFor } from '../../lib/stock';
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
//
// totalQty keeps that "owned" meaning; usableQty is what can actually be dispensed today, and is
// what the stock status is judged on. Comparing the owned total against the reorder level used to
// report "In Stock" for a medicine whose stock had almost entirely expired.
const deriveStock = (batches: BatchStockRow[], defaultSellingPrice: number, now = new Date()) => {
  const totalQty = ownedQty(batches);
  const validBatches = usableBatches(batches, now);
  const usable = ownedQty(validBatches);
  const stockStatus = stockStatusFor(batches, now);

  const fefoSorted = [...validBatches].sort((a, b) => a.expiry_date.getTime() - b.expiry_date.getTime());
  const nearestExpiry = fefoSorted.length ? fefoSorted[0].expiry_date : null;
  const expiryHorizon = addDays(now, EXPIRY_SOON_DAYS);
  const isExpiringSoon = nearestExpiry !== null && nearestExpiry <= expiryHorizon;

  const effectiveSellingPrice = fefoSorted.length ? fefoSorted[0].selling_price_per_base_unit : defaultSellingPrice;
  const stockValue = batches.filter((b) => b.qty_on_hand > 0).reduce((sum, b) => sum + b.qty_on_hand * b.cost_per_base_unit, 0);

  return { totalQty, usableQty: usable, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue };
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
      { name: { contains: term, mode: 'insensitive' } },
      { generic_name: { contains: term, mode: 'insensitive' } },
      { brand_name: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { form: { contains: term, mode: 'insensitive' } },
      { strength: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
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
    const { totalQty, stockStatus, effectiveSellingPrice } = deriveStock(m.batches, m.default_selling_price, now);

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
      { name: { contains: term, mode: 'insensitive' } },
      { generic_name: { contains: term, mode: 'insensitive' } },
      { brand_name: { contains: term, mode: 'insensitive' } },
      { category: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
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
    const { totalQty, usableQty: usable, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue } = deriveStock(m.batches, m.default_selling_price, now);
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
      usableQty: usable,
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
      default_selling_price: true,
      batches: { select: BATCH_PRICING_SELECT },
    },
  });

  const now = new Date();
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let expiringSoon = 0;
  const lowStockList: { medicineId: number; medicineName: string; totalQty: number }[] = [];

  for (const m of medicines) {
    const { totalQty, stockStatus, isExpiringSoon } = deriveStock(m.batches, m.default_selling_price, now);
    if (stockStatus === 'in-stock') inStock += 1;
    else if (stockStatus === 'low') {
      lowStock += 1;
      lowStockList.push({ medicineId: m.medicine_id, medicineName: m.name, totalQty });
    } else outOfStock += 1;
    if (isExpiringSoon) expiringSoon += 1;
  }

  // Emptiest first: with one clinic-wide threshold the shortfall is simply how little is left.
  lowStockList.sort((a, b) => a.totalQty - b.totalQty);

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
  if (params.batchNo) where.batches = { some: { batch_no: { contains: params.batchNo, mode: 'insensitive' } } };
  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { generic_name: { contains: term, mode: 'insensitive' } },
      { brand_name: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
    ];
  }

  const medicines = await prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { batches: { select: { ...BATCH_PRICING_SELECT, batch_no: true, location: true } } },
  });

  const now = new Date();
  let rows = medicines.map((m) => {
    const { totalQty, usableQty: usable, stockStatus, isExpiringSoon, nearestExpiry, effectiveSellingPrice, stockValue } = deriveStock(m.batches, m.default_selling_price, now);
    return {
      usableQty: usable,
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

export interface ImportRowResult {
  row: number;
  status: 'created' | 'updated' | 'error';
  /** What the row refers to, so a result list reads as medicines rather than row numbers. */
  name?: string;
  /** Units of opening stock this row adds, when it carries any. */
  stockAdded?: number;
  message?: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  errored: number;
  /** Batches created, and the total units they hold. Zero on a catalog-only sheet. */
  batches: number;
  unitsAdded: number;
  /** True when nothing was written — the caller asked for a preview. */
  dryRun: boolean;
  unknownHeaders: string[];
  results: ImportRowResult[];
}

// Dosage form -> the unit its stock is counted in. Mirrors the same helper in
// pharmacist-frontend/src/lib/medicines.ts so an imported sheet and the Add Medicine form agree.
const defaultBaseUnitForForm = (form: string): string => {
  const f = form.toLowerCase();
  if (f.includes('tablet')) return 'Tablet';
  if (f.includes('capsule')) return 'Capsule';
  if (f.includes('syrup') || f.includes('suspension') || f.includes('drop') || f.includes('injection')) return 'ml';
  if (f.includes('cream') || f.includes('ointment')) return 'Gram';
  return 'Piece';
};

const truthy = (value?: string) => !!value && ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());

/** Accepts what people actually type: 2027-06-30, 30/06/2027, 30-06-2027, or an Excel date cell. */
const parseSheetDate = (value: string): Date => {
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  // Day-first, which is the convention in Sri Lanka and what a nurse will type.
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    if (Number(m) > 12) throw new Error(`Could not read the expiry date "${text}" — use YYYY-MM-DD`);
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  throw new Error(`Could not read the expiry date "${text}" — use YYYY-MM-DD, for example 2027-06-30`);
};

const parseSheetNumber = (value: string, label: string): number => {
  // Tolerate thousands separators and a currency prefix typed into a price cell.
  const cleaned = value.replace(/[,\s]/g, '').replace(/^(rs\.?|lkr)/i, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`${label} "${value}" is not a number`);
  return n;
};

/**
 * Turn validated spreadsheet rows into medicines and their opening stock.
 *
 * Every row is validated before anything is written, and `dryRun` stops after that — so staff can
 * see exactly what a file will do before it touches the database, which matters when the file was
 * typed by hand by several people.
 *
 * Stock goes through runReceiveStockBatch, the same path as "Add Stock Batch", so each imported
 * batch gets its own purchase order and GRN rather than appearing from nowhere.
 */
export const importMedicineRows = async (
  sheet: { rows: { rowNumber: number; values: Record<string, string | undefined> }[]; unknownHeaders: string[] },
  actor: Actor,
  options: { dryRun?: boolean } = {}
): Promise<ImportSummary> => {
  const dryRun = !!options.dryRun;
  if (sheet.rows.length === 0) throw new ValidationError('The sheet has a header row but no medicines under it.');
  if (sheet.rows.length > 2000) throw new ValidationError('That sheet has more than 2000 rows — split it into smaller files.');

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errored = 0;
  let batches = 0;
  let unitsAdded = 0;

  // A sheet typed by several people repeats the same medicine; keep track so the second row adds a
  // batch to the medicine the first row created rather than failing to find it.
  const seen = new Map<string, number>();

  for (const row of sheet.rows) {
    const rec = row.values;
    const name = rec.name?.trim();
    try {
      if (!name) throw new Error('Medicine name is missing');

      const form = rec.form?.trim() || undefined;
      const baseUnit = rec.unit?.trim() || defaultBaseUnitForForm(form ?? '');
      const strength = rec.strength?.trim() || undefined;
      const brand = rec.brand_name?.trim() || undefined;

      const hasQty = !!rec.quantity?.trim();
      const hasExpiry = !!rec.expiry_date?.trim();
      const hasPrice = !!rec.selling_price?.trim();
      if ((hasQty || hasExpiry) && !(hasQty && hasExpiry && hasPrice)) {
        throw new Error('To add stock a row needs Quantity, Selling price and Expiry date together');
      }

      let quantity = 0;
      let sellingPrice = 0;
      let expiry: Date | null = null;
      if (hasQty) {
        quantity = parseSheetNumber(rec.quantity!, 'Quantity');
        if (!(quantity > 0)) throw new Error('Quantity must be greater than zero');
        sellingPrice = parseSheetNumber(rec.selling_price!, 'Selling price');
        if (!(sellingPrice > 0)) throw new Error('Selling price must be greater than zero');
        expiry = parseSheetDate(rec.expiry_date!);
        if (expiry.getTime() <= Date.now()) {
          throw new Error(`Expiry date ${rec.expiry_date} has already passed — expired stock cannot be imported`);
        }
      }

      const data = {
        name,
        generic_name: rec.generic_name?.trim() || undefined,
        brand_name: brand,
        category: rec.category?.trim() || undefined,
        form,
        strength,
        base_unit: baseUnit,
        requires_prescription: rec.requires_prescription ? truthy(rec.requires_prescription) : undefined,
        default_selling_price: hasPrice ? sellingPrice : undefined,
      };

      const dedupeKey = [name, brand ?? '', strength ?? '', form ?? ''].join('\u0000').toLowerCase();
      let medicineId = seen.get(dedupeKey) ?? null;
      let existed = medicineId !== null;
      // -1 marks "introduced earlier in this same dry run", which has no real id yet.
      if (medicineId === -1) medicineId = null;

      if (medicineId === null) {
        const existing = await prisma.medicine.findFirst({
          where: { name, strength: strength ?? null, form: form ?? null, brand_name: brand ?? null },
        });
        if (existing) {
          medicineId = existing.medicine_id;
          existed = true;
        }
      }

      if (dryRun) {
        // Nothing is written; report what would happen so the preview is trustworthy. That
        // includes remembering medicines this sheet has already introduced, or a second batch row
        // for the same medicine would be previewed as another new medicine.
        if (existed) updated++;
        else {
          created++;
          seen.set(dedupeKey, -1);
        }
        if (hasQty) {
          batches++;
          unitsAdded += quantity;
        }
        results.push({
          row: row.rowNumber,
          status: existed ? 'updated' : 'created',
          name,
          stockAdded: hasQty ? quantity : undefined,
        });
        continue;
      }

      if (medicineId !== null) {
        await prisma.medicine.update({ where: { medicine_id: medicineId }, data });
        updated++;
      } else {
        const medicine = await prisma.medicine.create({ data });
        medicineId = medicine.medicine_id;
        created++;
      }
      seen.set(dedupeKey, medicineId);

      if (hasQty && expiry) {
        await runReceiveStockBatch(
          {
            medicine_id: medicineId,
            batch_no: rec.batch_no?.trim() || undefined,
            expiry_date: expiry,
            received_unit: baseUnit,
            received_qty: quantity,
            units_per_pack: 1,
            purchase_price_per_pack: rec.cost_price?.trim() ? parseSheetNumber(rec.cost_price, 'Cost price') : undefined,
            selling_price_per_base_unit: sellingPrice,
          },
          actor
        );
        batches++;
        unitsAdded += quantity;
      }

      results.push({
        row: row.rowNumber,
        status: existed ? 'updated' : 'created',
        name,
        stockAdded: hasQty ? quantity : undefined,
      });
    } catch (err: any) {
      errored++;
      results.push({ row: row.rowNumber, status: 'error', name, message: err.message });
    }
  }

  return { created, updated, errored, batches, unitsAdded, dryRun, unknownHeaders: sheet.unknownHeaders, results };
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
