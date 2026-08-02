import { api } from './api';

export interface Invoice {
  invoice_id: number;
  patient_id: string;
  consultation_id: number | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  paid_amount: number;
  payment_status: 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';
  created_at: string;
}

export const listInvoicesByConsultation = (consultationId: number) =>
  api.get<{ data: Invoice[] }>('/invoices', { params: { consultationId } }).then((r) => r.data.data);

export const createInvoiceForConsultation = (consultationId: number, consultationFee?: number) =>
  api.post<Invoice>('/invoices', { consultation_id: consultationId, consultation_fee: consultationFee }).then((r) => r.data);
