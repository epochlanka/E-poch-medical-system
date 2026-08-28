import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getInvoice, voidInvoice } from '../../lib/billing';
import InvoicePreview from './InvoicePreview';

interface ViewInvoiceModalProps {
  invoiceId: number;
  canVoid: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ViewInvoiceModal = ({ invoiceId, canVoid, onClose, onChanged }: ViewInvoiceModalProps) => {
  const { data: invoice, loading, reload } = useApiData(() => getInvoice(invoiceId), [invoiceId]);
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVoid = async () => {
    if (!reason.trim()) {
      setError('A void reason is required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await voidInvoice(invoiceId, reason.trim());
      reload();
      onChanged();
      setShowVoidForm(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to void invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {loading && <p className="pat-muted">Loading…</p>}
        {invoice && (
          <>
            <InvoicePreview invoice={invoice} onPrint={() => window.print()} />

            {showVoidForm && (
              <div className="modal-field" style={{ marginTop: 14 }}>
                <label>Void reason *</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient disputed the charge" />
              </div>
            )}

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose}>
                Close
              </button>
              {canVoid && invoice.payment_status !== 'Voided' && !showVoidForm && (
                <button type="button" className="modal-btn secondary" onClick={() => setShowVoidForm(true)}>
                  Void Invoice
                </button>
              )}
              {showVoidForm && (
                <button type="button" className="modal-btn primary" onClick={handleVoid} disabled={submitting}>
                  {submitting ? 'Voiding…' : 'Confirm Void'}
                </button>
              )}
              {!showVoidForm && (
                <button type="button" className="modal-btn primary" onClick={() => window.print()}>
                  Download PDF
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewInvoiceModal;
