import { useState } from 'react';
import { recordPayments } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';

const METHODS: ('Cash' | 'Card' | 'Mobile')[] = ['Cash', 'Card', 'Mobile'];

interface RecordPaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: (invoice: Invoice) => void;
}

const RecordPaymentModal = ({ invoice, onClose, onSuccess }: RecordPaymentModalProps) => {
  const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
  const [lines, setLines] = useState<{ method: 'Cash' | 'Card' | 'Mobile'; amount: string }[]>([{ method: 'Cash', amount: balance.toFixed(2) }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLine = () => setLines((l) => [...l, { method: 'Cash', amount: '' }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payments = lines.filter((l) => Number(l.amount) > 0).map((l) => ({ method: l.method, amount: Number(l.amount) }));
      const updated = await recordPayments(invoice.invoice_id, payments);
      onSuccess(updated);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Record Payment</div>
        <div className="modal-subtitle">
          Invoice #{invoice.invoice_id} — Balance due: LKR {balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>

        {error && <div className="dash-error-banner">{error}</div>}

        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={l.method}
              onChange={(e) => setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, method: e.target.value as any } : x)))}
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            >
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={l.amount}
              onChange={(e) => setLines((arr) => arr.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))}
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
            {lines.length > 1 && (
              <button type="button" className="pat-btn" style={{ padding: '6px 10px' }} onClick={() => removeLine(i)}>
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px', marginBottom: 14 }} onClick={addLine}>
          + Split Payment
        </button>

        <div style={{ fontSize: 12.5, color: total > balance + 0.01 ? '#dc2626' : '#64748b', marginBottom: 14 }}>
          Total entered: LKR {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={total <= 0 || total > balance + 0.01 || submitting} onClick={handleSubmit}>
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordPaymentModal;
