import { api } from './api';

export interface Batch {
  batchId: number; batchNo: string; medicineId: number; medicineName: string;
  expiryDate: string; manufactureDate: string | null; qtyOnHand: number;
  location: string | null; supplierName: string | null; status: string;
}
export interface Page<T> { data: T[]; pagination: { page: number; totalPages: number; total: number } }
export interface LedgerEntry { ledgerId: number; changeQty: number; balanceAfter: number; eventType: string; reason: string | null; createdBy: string; createdAt: string }
export interface StockAlert { type: 'low-stock' | 'expiring-batch' | 'expired-batch'; severity: string; message: string; refId: number }
export interface StockCount { stock_count_id: number; status: string; created_at: string; performed_by_user: { username: string }; items: { batch_id: number; expected_qty: number; counted_qty: number; variance: number }[] }
export interface Supplier { supplier_id: number; name: string; phone: string | null; email: string | null; city: string | null; is_active: boolean }
export interface OrderItem { po_item_id: number; qty_ordered: number; medicine: { name: string; unit: string }; grn_items: { qty_received: number }[] }
export interface PurchaseOrder { po_id: number; status: string; order_date: string; expected_date: string | null; supplier: Supplier; items: OrderItem[]; orderedQty: number; receivedQty: number; totalAmount: number }
export interface Grn { grn_id: number; po_id: number; received_at: string; has_discrepancy: boolean; discrepancy_reviewed_at: string | null; purchase_order: { supplier: Supplier }; receiver: { username: string }; items?: { grn_item_id: number; qty_received: number; batch: { batch_no: string; expiry_date: string }; po_item: { medicine: { name: string } } }[] }
// patient_id is null for an unregistered walk-in — full_name still resolves to the visit's
// captured temp_patient_name (see backend billing/service.ts resolveDisplayPatient).
export interface Invoice { invoice_id: number; created_at: string; payment_status: string; total_amount: number; patient: { full_name: string; patient_id: string | null }; items: { invoice_item_id: number; item_type: string; description: string; qty: number; line_total: number }[] }
export interface Report { title: string; columns: { key: string; label: string }[]; rows: Record<string, string | number | boolean | null>[]; summary?: Record<string, string | number> }

export const getBatches = (params?: Record<string, string | number | undefined>) => api.get<Page<Batch>>('/inventory/batches', { params }).then(r => r.data);
export const getLedger = (id: number) => api.get<Page<LedgerEntry>>(`/inventory/batches/${id}/ledger`).then(r => r.data);
export const getStockAlerts = () => api.get<StockAlert[]>('/inventory/alerts').then(r => r.data);
export const getStockCounts = () => api.get<StockCount[]>('/inventory/stock-counts').then(r => r.data);
export const createStockCount = (items: { batch_id: number; counted_qty: number }[], notes: string) => api.post('/inventory/stock-counts', { items, notes }).then(r => r.data);
export const postStockCount = (id: number) => api.post(`/inventory/stock-counts/${id}/post`).then(r => r.data);
export const adjustStock = (batchId: number, delta: number, reason: string) => api.post(`/inventory/batches/${batchId}/adjust`, { delta, reason }).then(r => r.data);
export const getSuppliers = (search?: string) => api.get<Supplier[]>('/suppliers', { params: { search } }).then(r => r.data);
export const getOrders = (params?: Record<string, string | number | undefined>) => api.get<Page<PurchaseOrder>>('/suppliers/purchase-orders', { params }).then(r => r.data);
export const getOrder = (id: number) => api.get<PurchaseOrder>(`/suppliers/purchase-orders/${id}`).then(r => r.data);
export const createOrder = (supplier_id: number, items: { medicine_id: number; qty_ordered: number; unit_cost?: number }[]) => api.post('/suppliers/purchase-orders', { supplier_id, items }).then(r => r.data);
export const submitOrder = (id: number) => api.post(`/suppliers/purchase-orders/${id}/submit`).then(r => r.data);
export const closeOrder = (id: number) => api.post(`/suppliers/purchase-orders/${id}/close`).then(r => r.data);
export const receiveOrder = (id: number, items: { po_item_id: number; qty_received: number; batch_no: string; expiry_date: string }[]) => api.post(`/suppliers/purchase-orders/${id}/grn`, { items }).then(r => r.data);
export const getGrns = (params?: Record<string, string | boolean>) => api.get<Grn[]>('/suppliers/goods-received-notes', { params }).then(r => r.data);
export const getGrn = (id: number) => api.get<Grn>(`/suppliers/goods-received-notes/${id}`).then(r => r.data);
export const getInvoices = (params?: Record<string, string | number | undefined>) => api.get<Page<Invoice>>('/invoices', { params }).then(r => r.data);
export const getReport = (name: 'low-stock' | 'expiring-batches' | 'dispensing-volume', params?: Record<string, string | undefined>) => api.get<Report>(`/reports/pharmacist/${name}`, { params }).then(r => r.data);
