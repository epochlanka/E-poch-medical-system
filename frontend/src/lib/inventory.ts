import { api } from './api';

export interface Batch {
  batchId: number;
  batchNo: string;
  medicineId: number;
  medicineName: string;
  manufactureDate: string | null;
  expiryDate: string;
  qtyOnHand: number;
  location: string | null;
  supplierId: number | null;
  supplierName: string | null;
  status: 'Active' | 'Depleted' | 'Expired';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListBatchesParams {
  medicineId?: number;
  supplierId?: number;
  batchNo?: string;
  status?: 'Active' | 'Depleted' | 'Expired' | 'Expiring';
  page?: number;
  limit?: number;
}

export const listBatches = (params: ListBatchesParams) =>
  api.get<{ data: Batch[]; pagination: Pagination }>('/inventory/batches', { params }).then((r) => r.data);

export const adjustBatch = (batchId: number, delta: number, reason: string) =>
  api.post(`/inventory/batches/${batchId}/adjust`, { delta, reason }).then((r) => r.data);

export const updateBatchLocation = (batchId: number, location: string) =>
  api.patch(`/inventory/batches/${batchId}/location`, { location }).then((r) => r.data);
