import { useState } from 'react';
import { InvoiceIcon, PlusIcon } from '../../components/layout/Icons';
import type { ConsultationInvoice } from '../../lib/consultations';
import { createInvoiceForConsultation } from '../../lib/billing';
import { formatDateTime } from './consultationUtils';

const formatCurrency = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const STATUS_BADGE: Record<string, string> = {
  Outstanding: 'badge-amber',
  PartiallyPaid: 'badge-blue',
  Paid: 'badge-green',
  Voided: 'badge-red',
};

interface BillingTabProps {
  consultationId: number | null;
  invoices: ConsultationInvoice[];
  onCreated: () => void;
}

const BillingTab = ({ consultationId, invoices, onCreated }: BillingTabProps) => {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!consultationId) return;
    setError(null);
    setCreating(true);
    try {
      await createInvoiceForConsultation(consultationId);
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create invoice.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Billing</h3>
        {consultationId && invoices.length === 0 && (
          <button className="cons-btn primary" onClick={handleCreate} disabled={creating}>
            <PlusIcon /> {creating ? 'Creating…' : 'Create Invoice'}
          </button>
        )}
      </div>

      {error && <div className="dash-error-banner">{error}</div>}

      {!consultationId && <div className="card-empty">Save the consultation before creating an invoice.</div>}
      {consultationId && invoices.length === 0 && !error && <div className="card-empty">No invoice yet for this consultation.</div>}

      {invoices.map((inv) => (
        <div className="rx-row" key={inv.invoice_id}>
          <span className="rx-icon">
            <InvoiceIcon />
          </span>
          <div className="rx-info">
            <div className="rx-code">INV{String(inv.invoice_id).padStart(6, '0')}</div>
            <div className="rx-name">{formatCurrency(inv.total_amount)}</div>
            <div className="rx-time">{formatDateTime(inv.created_at)}</div>
          </div>
          <span className={`badge ${STATUS_BADGE[inv.payment_status] ?? 'badge-gray'}`}>{inv.payment_status}</span>
        </div>
      ))}
    </div>
  );
};

export default BillingTab;
