import { api } from './api';
import { listMasterData } from './settings';

// Sourced from the same PaymentMethod master-data list Settings edits, so a method an admin adds
// or retires there actually takes effect here rather than being purely decorative.
export const listPaymentMethodOptions = () => listMasterData('PaymentMethod').then((items) => items.map((i) => i.value));

export type InvoiceType = 'Consultation' | 'Pharmacy' | 'Consultation+Pharmacy';
export type PaymentStatus = 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';

export interface Invoice {
  invoice_id: number;
  // null for an unregistered walk-in — full_name/phone still resolve to the visit's captured
  // temp_patient_* fields (see backend billing/service.ts resolveDisplayPatient).
  patient_id: string | null;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  created_via: 'Manual' | 'Auto';
  created_at: string;
  type?: InvoiceType;
  patient?: { patient_id: string | null; full_name: string; phone?: string | null };
}

export const listInvoicesByConsultation = (consultationId: number) =>
  api.get<{ data: Invoice[] }>('/invoices', { params: { consultationId } }).then((r) => r.data.data);

export const createInvoiceForConsultation = (consultationId: number, consultationFee?: number, discounts?: { description: string; amount: number }[]) =>
  api.post<Invoice>('/invoices', { consultation_id: consultationId, consultation_fee: consultationFee, discounts }).then((r) => r.data);

export interface InvoiceItem {
  invoice_item_id: number;
  invoice_id: number;
  item_type: 'ConsultationFee' | 'Medicine' | 'Discount';
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  // Medicine lines only — the exact batch this line billed, for cost/profit reporting. Never
  // shown to the patient.
  medicine_id?: number | null;
  batch_id?: number | null;
  base_qty?: number | null;
  unit?: string | null;
  purchase_cost?: number | null;
  profit?: number | null;
}

export interface Payment {
  payment_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  received_at: string;
  receiver: { username: string };
}

export interface Refund {
  refund_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  reason: string | null;
  issued_at: string;
  issuer: { username: string };
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  payments: Payment[];
  refunds: Refund[];
  void_reason: string | null;
  voided_at: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListInvoicesParams {
  search?: string;
  patientId?: string;
  status?: PaymentStatus;
  type?: InvoiceType;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listInvoices = (params: ListInvoicesParams) =>
  api.get<{ data: Invoice[]; pagination: Pagination }>('/invoices', { params }).then((r) => r.data);

export const getInvoice = (invoiceId: number) => api.get<InvoiceDetail>(`/invoices/${invoiceId}`).then((r) => r.data);

export interface InvoiceStats {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  totalRevenueThisMonth: number;
}

export const getInvoiceStats = () => api.get<InvoiceStats>('/invoices/stats').then((r) => r.data);

export const recordPayments = (invoiceId: number, payments: { method: string; amount: number; idempotency_key?: string }[]) =>
  api.post<InvoiceDetail>(`/invoices/${invoiceId}/payments`, { payments }).then((r) => r.data);

export const voidInvoice = (invoiceId: number, reason: string, refunds?: { method: string; amount: number }[]) =>
  api.post<InvoiceDetail>(`/invoices/${invoiceId}/void`, { reason, refunds }).then((r) => r.data);

export const downloadInvoicePdf = async (invoiceId: number, code: string) => {
  const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---- Flat payments ledger (cross-invoice) --------------------------------------------------

export interface PaymentRow {
  paymentId: number;
  invoiceId: number;
  invoiceStatus: PaymentStatus;
  invoiceCreatedAt: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  amount: number;
  method: string;
  receivedAt: string;
  receivedBy: string;
}

export interface ListPaymentsParams {
  search?: string;
  method?: string;
  invoiceStatus?: PaymentStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listPayments = (params: ListPaymentsParams) =>
  api.get<{ data: PaymentRow[]; pagination: Pagination }>('/invoices/payments', { params }).then((r) => r.data);

export interface PaymentsStats {
  range: 'month' | 'quarter' | 'year' | 'all';
  totalPayments: number;
  totalReceived: number;
  totalReceivedThisMonth: number;
  outstandingInvoices: number;
  voidedInvoices: number;
  byMethod: { method: string; amount: number; count: number }[];
  byInvoiceStatus: { status: PaymentStatus; count: number }[];
}

export const getPaymentsStats = (range: PaymentsStats['range'] = 'month') =>
  api.get<PaymentsStats>('/invoices/payments/stats', { params: { range } }).then((r) => r.data);
