import { api } from './api';

export interface Medicine {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  unit: string;
  unit_price: number;
  is_active: boolean;
  stockStatus: 'in-stock' | 'low' | 'out-of-stock';
  totalQty: number;
}

export const searchMedicines = (search: string) => api.get<Medicine[]>('/medicines', { params: { search } }).then((r) => r.data);

export interface MedicineDetail {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  unit: string;
  reorder_level: number;
  max_stock_level: number;
  unit_price: number;
  buy_price: number;
  barcode: string | null;
  is_active: boolean;
}

export const getMedicine = (medicineId: number) => api.get<MedicineDetail>(`/medicines/${medicineId}`).then((r) => r.data);

export interface CreateMedicineInput {
  name: string;
  generic_name?: string;
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

export const createMedicine = (input: CreateMedicineInput) => api.post<MedicineDetail>('/medicines', input).then((r) => r.data);

export const updateMedicine = (medicineId: number, input: Partial<CreateMedicineInput> & { is_active?: boolean }) =>
  api.put<MedicineDetail>(`/medicines/${medicineId}`, input).then((r) => r.data);

export type MedicineStockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon';

export interface MedicineStockRow {
  medicine_id: number;
  name: string;
  generic_name: string | null;
  category: string | null;
  form: string | null;
  strength: string | null;
  unit: string;
  reorder_level: number;
  max_stock_level: number;
  buy_price: number;
  sell_price: number;
  barcode: string | null;
  is_active: boolean;
  totalQty: number;
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

export interface ListMedicineStockParams {
  search?: string;
  category?: string;
  status?: MedicineStockStatus;
  supplierId?: number;
  page?: number;
  limit?: number;
}

export const listMedicineStock = (params: ListMedicineStockParams) =>
  api.get<{ data: MedicineStockRow[]; pagination: Pagination }>('/medicines/stock', { params }).then((r) => r.data);

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
