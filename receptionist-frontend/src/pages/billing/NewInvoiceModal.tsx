import { useEffect, useState } from 'react';
import { listConsultations } from '../../lib/consultations';
import type { ConsultationListItem } from '../../lib/consultations';
import { listInvoices, createInvoiceForConsultation } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';
import { formatDate } from '../patients/patientUtils';

interface NewInvoiceModalProps {
  patientId: string;
  patientName: string;
  onClose: () => void;
  onSuccess: (invoice: Invoice) => void;
}

const NewInvoiceModal = ({ patientId, patientName, onClose, onSuccess }: NewInvoiceModalProps) => {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<ConsultationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<{ description: string; amount: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [consultRes, invoiceRes] = await Promise.all([
          listConsultations({ patientId, status: 'Finalized', limit: 50 }),
          listInvoices({ patientId, limit: 100 }),
        ]);
        const invoicedConsultationIds = new Set(
          invoiceRes.data.filter((inv) => inv.payment_status !== 'Voided' && inv.consultation_id).map((inv) => inv.consultation_id)
        );
        setCandidates(consultRes.data.filter((c) => !invoicedConsultationIds.has(c.consultationId)));
      } catch {
        setError('Failed to load this patient’s consultations.');
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  const addDiscount = () => setDiscounts((d) => [...d, { description: '', amount: '' }]);
  const removeDiscount = (i: number) => setDiscounts((d) => d.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const validDiscounts = discounts.filter((d) => d.description.trim() && Number(d.amount) > 0).map((d) => ({ description: d.description.trim(), amount: Number(d.amount) }));
      const invoice = await createInvoiceForConsultation(selectedId, validDiscounts.length ? validDiscounts : undefined);
      onSuccess(invoice);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">New Invoice</div>
        <div className="modal-subtitle">Pick one of {patientName}'s finalized, not-yet-invoiced consultations.</div>

        {error && <div className="dash-error-banner">{error}</div>}

        {loading && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>}
        {!loading && candidates.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8' }}>Every finalized consultation for this patient already has an invoice.</p>}

        {!loading && candidates.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eef1f7', borderRadius: 10, marginBottom: 14 }}>
            {candidates.map((c) => (
              <div
                key={c.consultationId}
                onClick={() => setSelectedId(c.consultationId)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  background: selectedId === c.consultationId ? '#f5f8ff' : 'white',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formatDate(c.createdAt)} — Dr. {c.doctorName}</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{c.diagnosis || c.complaint || 'No diagnosis recorded'}</div>
              </div>
            ))}
          </div>
        )}

        {selectedId && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Discounts (Optional)</label>
              <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={addDiscount}>
                + Add Discount
              </button>
            </div>
            {discounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input
                  placeholder="Description"
                  value={d.description}
                  onChange={(e) => setDiscounts((arr) => arr.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))}
                  style={{ flex: 2, border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={d.amount}
                  onChange={(e) => setDiscounts((arr) => arr.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)))}
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}
                />
                <button type="button" className="pat-btn" style={{ padding: '6px 10px' }} onClick={() => removeDiscount(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={!selectedId || submitting} onClick={handleCreate}>
            {submitting ? 'Creating…' : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewInvoiceModal;
