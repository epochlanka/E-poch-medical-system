import type { PurchaseOrderStatus } from '../../lib/suppliers';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatCurrency = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const poCode = (poId: number, orderDate: string) => `PO-${new Date(orderDate).getFullYear()}-${String(poId).padStart(4, '0')}`;

// Real backend statuses shown with friendlier labels — Received -> "Completed" and
// Submitted -> "Pending" are the two renames; everything else keeps its real name.
export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  Draft: 'Draft',
  Submitted: 'Pending',
  PartiallyReceived: 'Partially Received',
  Received: 'Completed',
  Closed: 'Closed',
  Cancelled: 'Cancelled',
};

export const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  Draft: 'badge-gray',
  Submitted: 'badge-amber',
  PartiallyReceived: 'badge-purple',
  Received: 'badge-green',
  Closed: 'badge-gray',
  Cancelled: 'badge-red',
};

export const receivedLabel = (status: PurchaseOrderStatus, pct: number) => {
  if (status === 'Cancelled') return '—';
  if (pct >= 100) return 'Full';
  if (pct > 0) return 'Partial';
  return 'Pending';
};
