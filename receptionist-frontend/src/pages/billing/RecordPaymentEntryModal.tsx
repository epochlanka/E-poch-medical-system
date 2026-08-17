import { useEffect, useState } from 'react';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { listInvoices } from '../../lib/billing';
import type { Invoice } from '../../lib/billing';
import { SearchIcon } from '../../components/layout/Icons';
import { initials } from '../patients/patientUtils';
import { formatCurrency, invoiceCode } from './billingUtils';

interface RecordPaymentEntryModalProps {
  onClose: () => void;
  onSelectInvoice: (invoice: Invoice) => void;
}

// Step 1 of "Record Payment" from the header (no invoice preselected): search a patient, then
// pick which of their outstanding invoices to pay — mirrors the admin app's ReceivePaymentModal
// search-first flow. Hands off to the shared RecordPaymentModal once an invoice is chosen.
const RecordPaymentEntryModal = ({ onClose, onSelectInvoice }: RecordPaymentEntryModalProps) => {
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [outstanding, setOutstanding] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      listPatients({ search: searchInput, status: 'active', limit: 8 })
        .then((res) => setResults(res.data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setSearchInput('');
    setResults([]);
    setLoadingInvoices(true);
    listInvoices({ patientId: p.patient_id, limit: 100 })
      .then((res) => setOutstanding(res.data.filter((inv) => inv.payment_status === 'Outstanding' || inv.payment_status === 'PartiallyPaid')))
      .finally(() => setLoadingInvoices(false));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Record Payment</div>
        <div className="modal-subtitle">Search a patient, then pick which invoice to pay.</div>

        {!patient && (
          <>
            <div className="pat-search">
              <SearchIcon />
              <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
            {searchInput.trim().length >= 2 && (
              <div className="bk-search-results" style={{ marginTop: 8 }}>
                {searching && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Searching…</div>}
                {!searching && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>No patients found.</div>}
                {!searching &&
                  results.map((p) => (
                    <div className="bk-search-row" key={p.patient_id} onClick={() => selectPatient(p)}>
                      <div className="pat-avatar">{initials(p.full_name)}</div>
                      <div>
                        <div className="pat-name">{p.full_name}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {p.patient_id}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {patient && (
          <>
            <div className="bk-patient-card" style={{ marginTop: 0, marginBottom: 14 }}>
              <div className="bk-patient-card-top">
                <div className="pat-avatar">{initials(patient.full_name)}</div>
                <div className="pat-name">
                  {patient.full_name} <span className="badge badge-blue">{patient.patient_id}</span>
                </div>
              </div>
            </div>

            {loadingInvoices && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading outstanding invoices…</p>}
            {!loadingInvoices && outstanding.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8' }}>This patient has no outstanding invoices.</p>}
            {!loadingInvoices &&
              outstanding.map((inv) => (
                <div
                  key={inv.invoice_id}
                  onClick={() => onSelectInvoice(inv)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #eef1f7', borderRadius: 10, marginBottom: 8, cursor: 'pointer' }}
                >
                  <span>
                    {invoiceCode(inv.invoice_id, inv.created_at)} — {inv.payment_status}
                  </span>
                  <strong>{formatCurrency(inv.total_amount - inv.paid_amount)}</strong>
                </div>
              ))}
            <button className="pat-btn" onClick={() => setPatient(null)}>
              Change Patient
            </button>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordPaymentEntryModal;
