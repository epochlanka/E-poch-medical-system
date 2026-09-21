export const paymentCode = (paymentId: number, receivedAt: string) => `PAY-${new Date(receivedAt).getFullYear()}-${String(paymentId).padStart(4, '0')}`;

export const METHOD_BADGE: Record<string, string> = {
  Cash: 'badge-green',
  Card: 'badge-blue',
  Mobile: 'badge-purple',
};

export const INVOICE_STATUS_COLOR: Record<string, string> = {
  Paid: '#22c55e',
  PartiallyPaid: '#f59e0b',
  Outstanding: '#ef4444',
  Voided: '#94a3b8',
};

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  Paid: 'Paid',
  PartiallyPaid: 'Partially Paid',
  Outstanding: 'Outstanding',
  Voided: 'Voided',
};
