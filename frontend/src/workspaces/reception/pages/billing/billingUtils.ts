import type { PaymentStatus } from '../../lib/billing';

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatDate(iso)}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

export const formatCurrency = (n: number) => `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Same convention the admin app's invoiceUtils.ts already established — INV-<year>-<invoice_id
// padded 4> — reused here rather than inventing a second, different-looking code format.
export const invoiceCode = (invoiceId: number, createdAt: string) => `INV-${new Date(createdAt).getFullYear()}-${String(invoiceId).padStart(4, '0')}`;

export const paymentStatusLabel = (status: PaymentStatus): string => {
  if (status === 'Paid') return 'Paid';
  if (status === 'Voided') return 'Voided';
  if (status === 'PartiallyPaid') return 'Partially Paid';
  return 'Unpaid';
};

export const STATUS_BADGE: Record<string, string> = {
  Paid: 'badge-green',
  'Partially Paid': 'badge-amber',
  Unpaid: 'badge-red',
  Voided: 'badge-gray',
};
