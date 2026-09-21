import { api } from './api';
import { listMasterData } from './settings';

export type PaymentStatus = 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';

export interface InvoicePayment {
  payment_id: number;
  invoice_id: number;
  method: string;
  amount: number;
  received_at: string;
  receiver: { username: string };
}

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

export interface Invoice {
  invoice_id: number;
  // null for an unregistered walk-in — full_name still resolves to the visit's captured
  // temp_patient_name (see backend billing/service.ts resolveDisplayPatient).
  patient_id: string | null;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  created_via: 'Manual' | 'Auto';
  created_at: string;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  patient?: { patient_id: string | null; full_name: string };
}

// Sourced from the same PaymentMethod master-data list Settings edits, so a method an admin adds
// or retires there actually takes effect at the pharmacy counter too.
export const listPaymentMethodOptions = () => listMasterData('PaymentMethod').then((items) => items.map((i) => i.value));

// Used at handover time to find the (at most one) active invoice for the visit this prescription
// belongs to — same one-invoice-per-consultation invariant the billing module enforces.
export const listInvoicesForConsultation = (consultationId: number) =>
  api.get<{ data: Invoice[] }>('/invoices', { params: { consultationId } }).then((r) => r.data.data.filter((inv) => inv.payment_status !== 'Voided'));

export const recordPayments = (invoiceId: number, payments: { method: string; amount: number; idempotency_key?: string }[]) =>
  api.post<Invoice>(`/invoices/${invoiceId}/payments`, { payments }).then((r) => r.data);
