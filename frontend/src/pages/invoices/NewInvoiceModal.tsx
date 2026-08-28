import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { listConsultations } from '../../lib/consultations';
import type { ConsultationSummary } from '../../lib/consultations';
import { listInvoices, createInvoiceForConsultation } from '../../lib/billing';
import { SearchIcon, TrashIcon, PlusIcon } from '../../components/layout/Icons';
import { formatDate } from './invoiceUtils';

interface NewInvoiceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface DiscountLine {
  description: string;
  amount: string;
}

const NewInvoiceModal = ({ onClose, onSuccess }: NewInvoiceModalProps) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);

  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [invoicedConsultationIds, setInvoicedConsultationIds] = useState<Set<number>>(new Set());
  const [loadingConsultations, setLoadingConsultations] = useState(false);
  const [consultationId, setConsultationId] = useState<number | null>(null);

  const [fee, setFee] = useState('');
  const [discounts, setDiscounts] = useState<DiscountLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2 || patient) return;
    const t = setTimeout(() => {
      listPatients({ search: patientQuery, status: 'active', limit: 20 }).then((res) => setPatientResults(res.data));
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, patient]);

  useEffect(() => {
    if (!patient) {
      setConsultations([]);
      return;
    }
    setLoadingConsultations(true);
    Promise.all([
      listConsultations({ patientId: patient.patient_id, status: 'Finalized', limit: 50 }),
      listInvoices({ patientId: patient.patient_id, limit: 100 }),
    ])
      .then(([consultRes, invoiceRes]) => {
        setConsultations(consultRes.data);
        setInvoicedConsultationIds(
          new Set(invoiceRes.data.filter((i) => i.payment_status !== 'Voided' && i.consultation_id).map((i) => i.consultation_id!))
        );
      })
      .finally(() => setLoadingConsultations(false));
  }, [patient]);

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setPatientQuery(p.full_name);
    setPatientResults([]);
  };

  const addDiscount = () => setDiscounts((d) => [...d, { description: '', amount: '' }]);
  const updateDiscount = (i: number, patch: Partial<DiscountLine>) => setDiscounts((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeDiscount = (i: number) => setDiscounts((d) => d.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!consultationId) {
      setError('Select a consultation to invoice.');
      return;
    }
    const cleanDiscounts = discounts.filter((d) => d.description.trim() && Number(d.amount) > 0).map((d) => ({ description: d.description.trim(), amount: Number(d.amount) }));

    setSubmitting(true);
    try {
      await createInvoiceForConsultation(consultationId, fee ? Number(fee) : undefined, cleanDiscounts.length ? cleanDiscounts : undefined);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">New Invoice</h3>
        <p className="modal-subtitle">Invoices are generated from a finalized consultation — pick the patient and visit to bill.</p>

        <div className="modal-field span-2" style={{ position: 'relative' }}>
          <label>Patient *</label>
          <div className="pat-search" style={{ background: '#f8fafc' }}>
            <SearchIcon />
            <input
              placeholder="Search by name, ID, or phone…"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setPatient(null);
                setConsultationId(null);
              }}
              autoComplete="off"
            />
          </div>
          {patientResults.length > 0 && (
            <div className="ph-search-results">
              {patientResults.map((p) => (
                <button type="button" key={p.patient_id} className="ph-search-result" onClick={() => selectPatient(p)}>
                  <span>{p.full_name}</span>
                  <span className="pat-muted">{p.phone || p.patient_id}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {patient && (
          <form onSubmit={handleSubmit}>
            <div className="modal-field" style={{ marginTop: 14 }}>
              <label>Consultation to invoice *</label>
              {loadingConsultations && <p className="pat-muted">Loading finalized consultations…</p>}
              {!loadingConsultations && consultations.length === 0 && (
                <p className="pat-muted">No finalized consultations for this patient yet.</p>
              )}
              {!loadingConsultations && consultations.length > 0 && (
                <select value={consultationId ?? ''} onChange={(e) => setConsultationId(Number(e.target.value))}>
                  <option value="" disabled>
                    Select a consultation…
                  </option>
                  {consultations.map((c) => (
                    <option key={c.consultationId} value={c.consultationId} disabled={invoicedConsultationIds.has(c.consultationId)}>
                      {formatDate(c.createdAt)} — {c.diagnosis || 'No diagnosis recorded'}
                      {invoicedConsultationIds.has(c.consultationId) ? ' (already invoiced)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="modal-field" style={{ marginTop: 14 }}>
              <label>Consultation fee override</label>
              <input type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Uses clinic default if left blank" />
            </div>

            <div className="modal-field" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ marginBottom: 0 }}>Discounts</label>
                <button type="button" className="card-link" onClick={addDiscount}>
                  <PlusIcon /> Add discount
                </button>
              </div>
              {discounts.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input placeholder="Description" value={d.description} onChange={(e) => updateDiscount(i, { description: e.target.value })} style={{ flex: 1 }} />
                  <input type="number" min={0} step="0.01" placeholder="Amount" value={d.amount} onChange={(e) => updateDiscount(i, { amount: e.target.value })} style={{ width: 100 }} />
                  <button type="button" className="pat-icon-btn" onClick={() => removeDiscount(i)} aria-label="Remove">
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="modal-btn primary" disabled={submitting || !consultationId}>
                {submitting ? 'Creating…' : 'Create Invoice'}
              </button>
            </div>
          </form>
        )}

        {!patient && (
          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewInvoiceModal;
