import { api } from './api';

// Medicine Product master fields, plus the batch-derived stock/price/expiry summary the
// Inventory Display table needs (Section 10) — computed server-side from whatever batches exist.
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
  sell_price: number;
  stockValue: number;
  stockStatus: 'in-stock' | 'low' | 'out-of-stock';
  isExpiringSoon: boolean;
  nearestExpiry: string | null;
  location: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogMeta {
  stats: { total: number; active: number; inactive: number; therapeuticClassCount: number; manufacturerCount: number };
  therapeuticClasses: string[];
  dosageForms: string[];
  manufacturers: string[];
  brands: string[];
}

export const getCatalogMeta = () => api.get<CatalogMeta>('/medicines/catalog-meta').then((r) => r.data);

export interface MedicineSearchResult {
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
}

// Unpaginated take-50 autocomplete, matching the backend's searchMedicines — used for the
// From/To medicine pickers in the Substitution Rules "Add New Rule" form and PO line picker.
export const searchMedicines = (search: string) =>
  api.get<MedicineSearchResult[]>('/medicines', { params: { search } }).then((r) => r.data);

export interface ListCatalogParams {
  search?: string;
  category?: string;
  form?: string;
  manufacturer?: string;
  brand?: string;
  batchNo?: string;
  status?: 'active' | 'inactive' | 'all';
  stockStatus?: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon';
  page?: number;
  limit?: number;
}

export const listMedicineCatalog = (params: ListCatalogParams) =>
  api.get<{ data: MedicineCatalogRow[]; pagination: Pagination }>('/medicines/catalog', { params }).then((r) => r.data);

export const getMedicineById = (medicineId: number) => api.get<MedicineCatalogRow>(`/medicines/${medicineId}`).then((r) => r.data);

// PACK_UNITS: Box/Strip/Bottle for packaged goods, Tablet/Capsule/ml/Tube/Piece for things
// commonly received loose, Other as an escape hatch (Section 2/17).
export const PACK_UNITS = ['Box', 'Strip', 'Bottle', 'Tablet', 'Capsule', 'ml', 'Tube', 'Piece', 'Other'];
export const BASE_UNITS = ['Tablet', 'Capsule', 'ml', 'Gram', 'Piece'];
export const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Cream', 'Ointment', 'Drops', 'Injection', 'Inhaler', 'Other'];

// Dosage form -> sensible default base unit, used to prefill Step 2 of the Add Medicine wizard.
export const defaultBaseUnitForForm = (form: string): string => {
  const f = form.toLowerCase();
  if (f.includes('tablet')) return 'Tablet';
  if (f.includes('capsule')) return 'Capsule';
  if (f.includes('syrup') || f.includes('suspension') || f.includes('drop') || f.includes('injection')) return 'ml';
  if (f.includes('cream') || f.includes('ointment')) return 'Gram';
  return 'Piece';
};

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

export interface MedicineInput {
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
  // Optional first batch, created in the same request via the same path as "Add Stock Batch" —
  // see backend/src/modules/medicines/service.ts (createMedicine -> receiveStockBatch).
  initial_stock?: StockBatchInput;
}

export const createMedicine = (input: MedicineInput) => api.post('/medicines', input).then((r) => r.data);

export const updateMedicine = (medicineId: number, input: Partial<MedicineInput> & { is_active?: boolean }) =>
  api.put(`/medicines/${medicineId}`, input).then((r) => r.data);

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

export interface MedicineWithBatches extends MedicineCatalogRow {
  batches: StockBatch[];
  effectiveSellingPrice: number;
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
