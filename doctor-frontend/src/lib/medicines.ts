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
