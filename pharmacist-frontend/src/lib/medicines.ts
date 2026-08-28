import { api } from './api';

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
  unit: string;
  unit_price: number;
  buy_price: number;
  reorder_level: number;
  max_stock_level: number;
  barcode: string | null;
  is_active: boolean;
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
  unit: string;
  unit_price: number;
  barcode: string | null;
  is_active: boolean;
}

// Unpaginated take-50 autocomplete, matching the backend's searchMedicines — used for the
// From/To medicine pickers in the Substitution Rules "Add New Rule" form.
export const searchMedicines = (search: string) =>
  api.get<MedicineSearchResult[]>('/medicines', { params: { search } }).then((r) => r.data);

export interface ListCatalogParams {
  search?: string;
  category?: string;
  form?: string;
  manufacturer?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
}

export const listMedicineCatalog = (params: ListCatalogParams) =>
  api.get<{ data: MedicineCatalogRow[]; pagination: Pagination }>('/medicines/catalog', { params }).then((r) => r.data);

export const getMedicineById = (medicineId: number) => api.get<MedicineCatalogRow>(`/medicines/${medicineId}`).then((r) => r.data);

export interface MedicineInput {
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

export const createMedicine = (input: MedicineInput) => api.post('/medicines', input).then((r) => r.data);

export const updateMedicine = (medicineId: number, input: Partial<MedicineInput> & { is_active?: boolean }) =>
  api.put(`/medicines/${medicineId}`, input).then((r) => r.data);

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
