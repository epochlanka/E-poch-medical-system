import { api } from './api';

export interface Medicine {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  base_unit: string;
  requires_prescription: boolean;
  unit_price: number; // effective price right now — the FEFO batch's selling price, or the fallback default if no stock
  barcode: string | null;
  is_active: boolean;
  stockStatus: 'in-stock' | 'low' | 'out-of-stock';
  totalQty: number;
}

export const searchMedicines = (search: string) => api.get<Medicine[]>('/medicines', { params: { search } }).then((r) => r.data);

// Raw Medicine Product master-data row (GET/PUT /medicines/:id) — no batch-derived pricing here,
// since a Medicine no longer carries its own buy/sell price; those live on its Batches.
export interface MedicineDetail {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  manufacturer: string | null;
  requires_prescription: boolean;
  base_unit: string;
  default_pack_unit: string | null;
  default_pack_size: number | null;
  default_selling_price: number;
  reorder_level: number;
  max_stock_level: number;
  barcode: string | null;
  is_active: boolean;
}

export const getMedicine = (medicineId: number) => api.get<MedicineDetail>(`/medicines/${medicineId}`).then((r) => r.data);

// Shared by a brand-new medicine's opening stock (initial_stock) and the standalone "Add Stock
// Batch" action — see backend/src/modules/medicines/router.ts stockBatchSchema.
export interface StockBatchInput {
  supplier_id: number;
  batch_no: string;
  purchase_date?: string;
  manufacture_date?: string;
  expiry_date: string;
  received_unit: string;
  received_qty: number;
  units_per_pack: number;
  purchase_price_per_pack: number;
  selling_price_per_pack?: number;
  selling_price_per_base_unit?: number;
  location?: string;
}

export interface CreateMedicineInput {
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
  initial_stock?: StockBatchInput;
}

export const createMedicine = (input: CreateMedicineInput) => api.post<MedicineDetail>('/medicines', input).then((r) => r.data);

export const updateMedicine = (medicineId: number, input: Partial<CreateMedicineInput> & { is_active?: boolean }) =>
  api.put<MedicineDetail>(`/medicines/${medicineId}`, input).then((r) => r.data);

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MedicineStats {
  totalMedicines: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  expiringList: { medicineId: number; medicineName: string; expiryDate: string; qty: number }[];
  lowStockList: { medicineId: number; medicineName: string; totalQty: number; reorderLevel: number }[];
}

export const getMedicineStats = () => api.get<MedicineStats>('/medicines/stats').then((r) => r.data);

// ---- Medicine Catalog (Section 10 "Inventory Display"): master-data fields plus the same
// batch-derived stock/price/expiry summary the Pharmacy/Stock pages need, in one paginated,
// filterable call — the single source the inventory table below is built on. --------------------

export interface MedicineCatalogRow {
  medicine_id: number;
  code: string;
  name: string;
  generic_name: string | null;
  brand_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  manufacturer: string | null;
  requires_prescription: boolean;
  base_unit: string;
  default_pack_unit: string | null;
  default_pack_size: number | null;
  default_selling_price: number;
  reorder_level: number;
  max_stock_level: number;
  barcode: string | null;
  is_active: boolean;
  totalQty: number;
  batchCount: number;
  sell_price: number; // effective selling price right now (FEFO batch, or the fallback default if no stock)
  stockValue: number; // sum of qty_on_hand * cost_per_base_unit across every batch still holding stock
  stockStatus: 'in-stock' | 'low' | 'out-of-stock';
  isExpiringSoon: boolean;
  nearestExpiry: string | null;
  location: string | null;
}

export interface CatalogMeta {
  stats: { total: number; active: number; inactive: number; therapeuticClassCount: number; manufacturerCount: number };
  therapeuticClasses: string[];
  dosageForms: string[];
  manufacturers: string[];
  brands: string[];
}

export const getCatalogMeta = () => api.get<CatalogMeta>('/medicines/catalog-meta').then((r) => r.data);

export interface ListCatalogParams {
  search?: string;
  category?: string;
  form?: string;
  manufacturer?: string;
  brand?: string;
  batchNo?: string;
  status?: 'active' | 'inactive' | 'all';
  stockStatus?: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon';
  supplierId?: number;
  page?: number;
  limit?: number;
}

export const listMedicineCatalog = (params: ListCatalogParams) =>
  api.get<{ data: MedicineCatalogRow[]; pagination: Pagination }>('/medicines/catalog', { params }).then((r) => r.data);

// PACK_UNITS: Box/Strip/Bottle for packaged goods, Tablet/Capsule/ml/Tube/Piece for things
// commonly received loose, Other as an escape hatch.
export const PACK_UNITS = ['Box', 'Strip', 'Bottle', 'Tablet', 'Capsule', 'ml', 'Tube', 'Piece', 'Other'];
// The atomic unit stock/pricing is tracked in — matches backend/prisma/schema.prisma Medicine.base_unit.
export const BASE_UNITS = ['Tablet', 'Capsule', 'ml', 'Gram', 'Piece'];
export const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Cream', 'Ointment', 'Drops', 'Injection', 'Inhaler', 'Other'];

// Dosage form -> sensible default base unit, used to prefill the Add Medicine wizard's Packaging step.
export const defaultBaseUnitForForm = (form: string): string => {
  const f = form.toLowerCase();
  if (f.includes('tablet')) return 'Tablet';
  if (f.includes('capsule')) return 'Capsule';
  if (f.includes('syrup') || f.includes('suspension') || f.includes('drop') || f.includes('injection')) return 'ml';
  if (f.includes('cream') || f.includes('ointment')) return 'Gram';
  return 'Piece';
};

// ---- Stock Batches (Section 13/16/17): a Medicine Product's batches, and the "Add Stock Batch"
// shortcut that adds one to an existing product without creating a duplicate. ------------------

export interface StockBatch {
  batch_id: number;
  medicine_id: number;
  batch_no: string;
  supplier_id: number | null;
  supplier: { supplier_id: number; name: string } | null;
  purchase_date: string;
  manufacture_date: string | null;
  expiry_date: string;
  received_unit: string;
  received_qty: number;
  units_per_pack: number;
  qty_base_total: number;
  qty_on_hand: number;
  purchase_price_per_pack: number;
  cost_per_base_unit: number;
  selling_price_per_pack: number | null;
  selling_price_per_base_unit: number;
  location: string | null;
  status: 'Active' | 'Depleted' | 'Expired';
}

export interface MedicineWithBatches extends MedicineDetail {
  batches: StockBatch[];
  totalQty: number;
  stockStatus: 'in-stock' | 'low' | 'out-of-stock';
  isExpiringSoon: boolean;
  nearestExpiry: string | null;
  effectiveSellingPrice: number;
  stockValue: number;
}

export const getMedicineWithBatches = (medicineId: number) => api.get<MedicineWithBatches>(`/medicines/${medicineId}/batches`).then((r) => r.data);

export const addStockBatch = (medicineId: number, input: StockBatchInput) =>
  api.post<StockBatch>(`/medicines/${medicineId}/stock-batches`, input).then((r) => r.data);

export interface ImportResultRow {
  row: number;
  status: 'created' | 'updated' | 'error';
  message?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  errored: number;
  results: ImportResultRow[];
}

export const importMedicines = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<ImportResult>('/medicines/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
