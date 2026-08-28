import { api } from './api';

export type InvoiceType = 'Consultation' | 'Pharmacy' | 'Consultation+Pharmacy';
export type PaymentStatus = 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';

export interface Invoice {
  invoice_id: number;
  patient_id: string;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  created_at: string;
  type?: InvoiceType;
  patient?: { patient_id: string; full_name: string; phone?: string | null };
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
}

export interface Payment {
  payment_id: number;
  invoice_id: number;
  method: 'Cash' | 'Card' | 'Mobile';
  amount: number;
  received_at: string;
  receiver: { username: string };
}

export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  payments: Payment[];
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

export const recordPayments = (invoiceId: number, payments: { method: 'Cash' | 'Card' | 'Mobile'; amount: number }[]) =>
  api.post<InvoiceDetail>(`/invoices/${invoiceId}/payments`, { payments }).then((r) => r.data);

export const voidInvoice = (invoiceId: number, reason: string) => api.post<InvoiceDetail>(`/invoices/${invoiceId}/void`, { reason }).then((r) => r.data);

// ---- Flat payments ledger (cross-invoice) --------------------------------------------------

export interface PaymentRow {
  paymentId: number;
  invoiceId: number;
  invoiceStatus: PaymentStatus;
  invoiceCreatedAt: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  amount: number;
  method: 'Cash' | 'Card' | 'Mobile';
  receivedAt: string;
  receivedBy: string;
}

export interface ListPaymentsParams {
  search?: string;
  method?: 'Cash' | 'Card' | 'Mobile';
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
