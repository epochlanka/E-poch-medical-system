import type { PaymentStatus } from '../../lib/billing';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatDate(iso)}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

export const formatCurrency = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const invoiceCode = (invoiceId: number, createdAt: string) => `INV-${new Date(createdAt).getFullYear()}-${String(invoiceId).padStart(4, '0')}`;

// "Overdue" is a display-only bucket (same-day walk-in clinic: still unpaid from a day other
// than today) computed the same way the backend's getInvoiceStats() computes it, so a single
// invoice row's badge always agrees with which KPI card it would be counted under.
export const isOverdue = (status: PaymentStatus, createdAt: string) => {
  if (status !== 'Outstanding' && status !== 'PartiallyPaid') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(createdAt) < today;
};

export const paymentStatusLabel = (status: PaymentStatus, createdAt: string): string => {
  if (status === 'Paid') return 'Paid';
  if (status === 'Voided') return 'Voided';
  if (isOverdue(status, createdAt)) return 'Overdue';
  return status === 'PartiallyPaid' ? 'Partial' : 'Unpaid';
};

export const invoiceStatusLabel = (status: PaymentStatus): string => {
  if (status === 'Paid') return 'Paid';
  if (status === 'Voided') return 'Voided';
  if (status === 'PartiallyPaid') return 'Partially Paid';
  return 'Unpaid';
};

export const STATUS_BADGE: Record<string, string> = {
  Paid: 'badge-green',
  Partial: 'badge-amber',
  'Partially Paid': 'badge-amber',
  Unpaid: 'badge-red',
  Overdue: 'badge-red',
  Voided: 'badge-gray',
};
