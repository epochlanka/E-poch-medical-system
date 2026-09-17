import { api } from './api';
import { listMasterData } from './settings';

export type InvoiceType = 'Consultation' | 'Pharmacy' | 'Consultation+Pharmacy';
export type PaymentStatus = 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';

// Sourced from the same PaymentMethod master-data list Settings edits, so a method an admin adds
// or retires there actually takes effect here rather than being purely decorative.
export const listPaymentMethodOptions = () => listMasterData('PaymentMethod').then((items) => items.map((i) => i.value));

export interface InvoiceItem {
  invoice_item_id: number;
  invoice_id: number;
  item_type: 'ConsultationFee' | 'Medicine' | 'Discount';
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface InvoicePayment {
  payment_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  received_at: string;
  receiver: { username: string };
}

export interface InvoiceRefund {
  refund_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  reason: string | null;
  issued_at: string;
  issuer: { username: string };
}

// A visit's doctor/consultation-type context, reached through Invoice -> Consultation ->
// Appointment (an Invoice has no doctor column of its own) — null when the invoice has no
// linked consultation at all.
export interface InvoiceVisitContext {
  appointment: {
    doctor: { user_id: number; username: string; registration_number: string | null };
    consultation_type: string | null;
    scheduled_at: string;
    is_walk_in: boolean;
    visit_type: string;
  };
}

export interface Invoice {
  invoice_id: number;
  patient_id: string | null;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  created_via: 'Manual' | 'Auto';
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  type: InvoiceType;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  refunds: InvoiceRefund[];
  // patient_id is null for an unregistered walk-in — full_name/phone still resolve to the
  // visit's captured temp_patient_* fields (see backend billing/service.ts resolveDisplayPatient).
  patient: { patient_id: string | null; full_name: string; phone?: string | null };
  creator: { username: string };
  consultation: InvoiceVisitContext | null;
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
  consultationId?: number;
  status?: PaymentStatus;
  type?: InvoiceType;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listInvoices = (params: ListInvoicesParams) =>
  api.get<{ data: Invoice[]; pagination: Pagination }>('/invoices', { params }).then((r) => r.data);

export const getInvoice = (invoiceId: number) => api.get<Invoice>(`/invoices/${invoiceId}`).then((r) => r.data);

export const createInvoiceForConsultation = (consultationId: number, discounts?: { description: string; amount: number }[]) =>
  api.post<Invoice>('/invoices', { consultation_id: consultationId, discounts }).then((r) => r.data);

export const recordPayments = (invoiceId: number, payments: { method: string; amount: number; idempotency_key?: string }[]) =>
  api.post<Invoice>(`/invoices/${invoiceId}/payments`, { payments }).then((r) => r.data);

export const downloadInvoicePdf = async (invoiceId: number, code: string) => {
  const res = await api.get(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};

export interface PaymentRow {
  paymentId: number;
  invoiceId: number;
  invoiceStatus: PaymentStatus;
  invoiceCreatedAt: string;
  invoiceSubtotal: number;
  invoiceDiscount: number;
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
  outstandingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
  byInvoiceStatus: { status: PaymentStatus; count: number }[];
  today: { total: number; count: number };
  yesterdayTotal: number;
  thisWeek: { total: number; count: number };
  lastWeekTotal: number;
  thisMonth: { total: number; count: number };
  lastMonthTotal: number;
}

export const getPaymentsStats = (range: PaymentsStats['range'] = 'month') => api.get<PaymentsStats>('/invoices/payments/stats', { params: { range } }).then((r) => r.data);
