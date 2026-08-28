import { api } from './api';

export interface Supplier {
  supplier_id: number;
  name: string;
  contact: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  payment_terms_days: number;
  address: string | null;
  is_active: boolean;
  // Computed live from purchase orders, not stored — present on every list response.
  totalOrders: number;
  totalPayable: number;
  overduePayable: number;
}

export interface ListSuppliersParams {
  search?: string;
  includeInactive?: boolean;
}

export const listSuppliers = (params: ListSuppliersParams = {}) =>
  api.get<Supplier[]>('/suppliers', { params: { search: params.search, includeInactive: params.includeInactive ? 'true' : undefined } }).then((r) => r.data);

export interface CreateSupplierInput {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  city?: string;
  payment_terms_days?: number;
  address?: string;
}

export const createSupplier = (input: CreateSupplierInput) => api.post<Supplier>('/suppliers', input).then((r) => r.data);

export const updateSupplier = (supplierId: number, input: Partial<CreateSupplierInput> & { is_active?: boolean }) =>
  api.put<Supplier>(`/suppliers/${supplierId}`, input).then((r) => r.data);

export const getSupplier = (supplierId: number) => api.get<Supplier>(`/suppliers/${supplierId}`).then((r) => r.data);

export interface SupplierStats {
  totalSuppliers: number;
  activeSuppliers: number;
  totalOrdersThisMonth: number;
  totalPayable: number;
  overduePayable: number;
}

export const getSupplierStats = () => api.get<SupplierStats>('/suppliers/stats').then((r) => r.data);

export type PurchaseOrderStatus = 'Draft' | 'Submitted' | 'PartiallyReceived' | 'Received' | 'Closed' | 'Cancelled';

export interface CreatePurchaseOrderInput {
  supplier_id: number;
  order_date?: string;
  expected_date?: string;
  items: { medicine_id: number; qty_ordered: number; unit_cost?: number }[];
}

export const createPurchaseOrder = (input: CreatePurchaseOrderInput) =>
  api.post<PurchaseOrderDetail>('/suppliers/purchase-orders', input).then((r) => r.data);

export interface PoItem {
  po_item_id: number;
  po_id: number;
  medicine_id: number;
  qty_ordered: number;
  unit_cost: number | null;
  grn_items?: { grn_item_id: number; qty_received: number }[];
  medicine?: { medicine_id: number; name: string; unit: string };
}

export interface PurchaseOrder {
  po_id: number;
  supplier_id: number;
  order_date: string;
  expected_date: string | null;
  status: PurchaseOrderStatus;
  created_by: number;
  created_at: string;
  supplier: { supplier_id: number; name: string; contact?: string | null };
  items: PoItem[];
  orderedQty: number;
  receivedQty: number;
  receivedPct: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  grns: { grn_id: number; received_at: string; has_discrepancy: boolean; items: { grn_item_id: number; po_item_id: number; qty_received: number }[] }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListPurchaseOrdersParams {
  search?: string;
  supplierId?: number;
  status?: PurchaseOrderStatus;
  page?: number;
  limit?: number;
}

export const listPurchaseOrders = (params: ListPurchaseOrdersParams) =>
  api.get<{ data: PurchaseOrder[]; pagination: Pagination }>('/suppliers/purchase-orders', { params }).then((r) => r.data);

export const getPurchaseOrder = (poId: number) => api.get<PurchaseOrderDetail>(`/suppliers/purchase-orders/${poId}`).then((r) => r.data);

export type PoRange = 'month' | 'quarter' | 'year' | 'all';

export interface PurchaseOrderStats {
  totalOrders: number;
  completed: number;
  pending: number;
  partiallyReceived: number;
  cancelled: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
}

export const getPurchaseOrderStats = (range: PoRange = 'month') =>
  api.get<PurchaseOrderStats>('/suppliers/purchase-orders/stats', { params: { range } }).then((r) => r.data);

export interface TopSupplier {
  supplierId: number;
  supplierName: string;
  orderCount: number;
  totalAmount: number;
}

export const getTopSuppliers = (range: PoRange = 'month', limit = 5) =>
  api.get<TopSupplier[]>('/suppliers/purchase-orders/top-suppliers', { params: { range, limit } }).then((r) => r.data);

export const submitPurchaseOrder = (poId: number) => api.post(`/suppliers/purchase-orders/${poId}/submit`).then((r) => r.data);
export const closePurchaseOrder = (poId: number) => api.post(`/suppliers/purchase-orders/${poId}/close`).then((r) => r.data);
export const cancelPurchaseOrder = (poId: number) => api.post(`/suppliers/purchase-orders/${poId}/cancel`).then((r) => r.data);

export interface GrnItemInput {
  po_item_id: number;
  qty_received: number;
  batch_no: string;
  expiry_date: string;
  manufacture_date?: string;
}

export const receiveGrn = (poId: number, items: GrnItemInput[]) =>
  api.post(`/suppliers/purchase-orders/${poId}/grn`, { items }).then((r) => r.data);
