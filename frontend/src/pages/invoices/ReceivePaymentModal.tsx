import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { listInvoices, recordPayments } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';
import { SearchIcon, TrashIcon, PlusIcon } from '../../components/layout/Icons';
import { formatCurrency, invoiceCode } from './invoiceUtils';

interface ReceivePaymentModalProps {
  invoice?: Invoice | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface PaymentLine {
  method: 'Cash' | 'Card' | 'Mobile';
  amount: string;
}

const ReceivePaymentModal = ({ invoice, onClose, onSuccess }: ReceivePaymentModalProps) => {
  const [selected, setSelected] = useState<Invoice | null>(invoice ?? null);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Invoice[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([{ method: 'Cash', amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = selected ? selected.total_amount - selected.paid_amount : 0;

  useEffect(() => {
    if (selected || !searchTerm.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      listInvoices({ search: searchTerm, limit: 20 }).then((res) => setResults(res.data.filter((i) => i.payment_status === 'Outstanding' || i.payment_status === 'PartiallyPaid')));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, selected]);

  useEffect(() => {
    if (selected) setLines([{ method: 'Cash', amount: String(selected.total_amount - selected.paid_amount) }]);
  }, [selected]);

  const updateLine = (i: number, patch: Partial<PaymentLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { method: 'Cash', amount: '' }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const totalEntered = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) return;
    const toSubmit = lines.filter((l) => Number(l.amount) > 0).map((l) => ({ method: l.method, amount: Number(l.amount) }));
    if (toSubmit.length === 0) {
      setError('Enter at least one payment amount.');
      return;
    }
    if (totalEntered > balance + 0.01) {
      setError(`Total payment (${formatCurrency(totalEntered)}) exceeds the outstanding balance (${formatCurrency(balance)}).`);
      return;
    }
    setSubmitting(true);
    try {
      await recordPayments(selected.invoice_id, toSubmit);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Receive Payment</h3>
        <p className="modal-subtitle">Record a cash, card, or mobile payment against an outstanding invoice.</p>

        {!selected ? (
          <div className="modal-field">
            <label>Find invoice *</label>
            <div className="pat-search" style={{ background: '#f8fafc' }}>
              <SearchIcon />
              <input autoFocus placeholder="Search by invoice number or patient…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="ph-search-results">
                {results.map((inv) => (
                  <button type="button" key={inv.invoice_id} className="ph-search-result" onClick={() => setSelected(inv)}>
                    <span>
                      {invoiceCode(inv.invoice_id, inv.created_at)} · {inv.patient?.full_name}
                    </span>
                    <span className="pat-muted">Balance {formatCurrency(inv.total_amount - inv.paid_amount)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="ph-selected-medicine">
              <span>
                {invoiceCode(selected.invoice_id, selected.created_at)} · {selected.patient?.full_name} · Balance {formatCurrency(balance)}
              </span>
              {!invoice && (
                <button type="button" className="card-link" onClick={() => setSelected(null)}>
                  Change
                </button>
              )}
            </div>

            <div className="modal-field" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ marginBottom: 0 }}>Payment</label>
                <button type="button" className="card-link" onClick={addLine}>
                  <PlusIcon /> Split payment
                </button>
              </div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select value={l.method} onChange={(e) => updateLine(i, { method: e.target.value as PaymentLine['method'] })} style={{ width: 110 }}>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Mobile">Mobile</option>
                  </select>
                  <input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} style={{ flex: 1 }} />
                  {lines.length > 1 && (
                    <button type="button" className="pat-icon-btn" onClick={() => removeLine(i)} aria-label="Remove">
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
              <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 700, color: totalEntered > balance + 0.01 ? '#dc2626' : '#0f172a' }}>
                Total: {formatCurrency(totalEntered)}
              </div>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="modal-btn primary" disabled={submitting}>
                {submitting ? 'Recording…' : 'Record Payment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ReceivePaymentModal;
