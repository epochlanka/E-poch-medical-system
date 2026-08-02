import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { getPrescriptionContext, createPrescription } from '../../lib/prescriptions';
import type { PrescriptionItemInput } from '../../lib/prescriptions';
import { PrintIcon, ChevronLeftIcon, SaveIcon, SendIcon, SearchIcon, TrashIcon, AlertIcon, CheckCircleIcon } from '../../components/layout/Icons';
import { initials, calculateAge, formatDate } from '../consultations/consultationUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../families/families.css';
import '../consultations/consultation.css';
import './prescriptions.css';

interface DraftItem {
  key: string;
  medicine_id: number;
  name: string;
  generic_name: string | null;
  strength: string | null;
  unit: string;
  totalQty: number;
  reorderLevel: number;
  dosage: string;
  frequency: string;
  duration: string;
  qty: string;
}

const draftKey = (consultationId: number) => `epoch_rx_draft_${consultationId}`;

const NewPrescription = () => {
  const { consultationId } = useParams();
  const navigate = useNavigate();
  const id = Number(consultationId);

  const { data: context, loading, error } = useApiData(() => getPrescriptionContext(id), [id]);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState('');
  const [prescriptionType, setPrescriptionType] = useState<'new' | 'repeat'>('new');
  const [repeatFromId, setRepeatFromId] = useState<number | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [allergyConflicts, setAllergyConflicts] = useState<string[] | null>(null);

  // Load a locally-saved draft (there's no server-side Draft status for prescriptions —
  // they're created atomically once sent — so "Save as Draft" persists to localStorage instead).
  useEffect(() => {
    if (!id) return;
    const raw = localStorage.getItem(draftKey(id));
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setItems(saved.items ?? []);
        setNotes(saved.notes ?? '');
      } catch {
        /* ignore corrupt draft */
      }
    }
  }, [id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchMedicines(searchTerm).then((results) => {
        setSearchResults(results);
        setSearchOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const addMedicine = (m: Medicine) => {
    if (items.some((i) => i.medicine_id === m.medicine_id)) {
      setSearchOpen(false);
      setSearchTerm('');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: `${m.medicine_id}-${Date.now()}`,
        medicine_id: m.medicine_id,
        name: m.name,
        generic_name: m.generic_name,
        strength: m.strength,
        unit: m.unit,
        totalQty: m.totalQty,
        reorderLevel: 0,
        dosage: '1 ' + m.unit,
        frequency: '',
        duration: '',
        qty: '1',
      },
    ]);
    setSearchTerm('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  const updateItem = (key: string, field: keyof DraftItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const applyPastPrescription = (prescriptionId: number) => {
    const past = context?.pastPrescriptions.find((p) => p.prescriptionId === prescriptionId);
    if (!past) return;
    setRepeatFromId(prescriptionId);
    setItems(
      past.items.map((i) => ({
        key: `${i.medicineId}-${Date.now()}-${Math.random()}`,
        medicine_id: i.medicineId,
        name: i.medicine,
        generic_name: null,
        strength: null,
        unit: '',
        totalQty: 0,
        reorderLevel: 0,
        dosage: i.dosage,
        frequency: i.frequency ?? '',
        duration: i.duration ?? '',
        qty: String(i.qty),
      }))
    );
  };

  const handleSaveDraft = () => {
    if (!id) return;
    localStorage.setItem(draftKey(id), JSON.stringify({ items, notes }));
    setDraftSavedAt(new Date());
  };

  const buildItemsInput = (): PrescriptionItemInput[] =>
    items.map((i) => ({
      medicine_id: i.medicine_id,
      dosage: i.dosage,
      frequency: i.frequency || undefined,
      duration: i.duration || undefined,
      qty: Number(i.qty) || 1,
    }));

  const submit = async (allergyAck = false) => {
    if (items.length === 0) {
      setSubmitError('Add at least one medicine before sending.');
      return;
    }
    setSubmitError(null);
    setAllergyConflicts(null);
    setSubmitting(true);
    try {
      const res = await createPrescription({
        consultation_id: id,
        items: buildItemsInput(),
        refill_of_prescription_id: prescriptionType === 'repeat' && repeatFromId ? repeatFromId : undefined,
        allergyAck,
      });
      localStorage.removeItem(draftKey(id));
      navigate(`/prescriptions/${res.data.prescription_id}`);
    } catch (err: any) {
      if (err.response?.status === 409 && err.response.data?.conflicts) {
        setAllergyConflicts(err.response.data.conflicts);
      } else {
        setSubmitError(err.response?.data?.message || 'Failed to send prescription.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const { patient } = context.appointment;
  const totalQuantity = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);

  const stockIssues = items.filter((i) => i.totalQty > 0 && i.totalQty < Number(i.qty));
  const outOfStock = items.filter((i) => i.totalQty === 0 && i.unit);

  return (
    <div>
      <div className="cons-header">
        <div>
          <h1>Prescriptions</h1>
          <div className="cons-breadcrumb">
            <button className="pat-id-link" onClick={() => navigate(`/consultations/${context.appointment.appointmentId}`)} style={{ fontSize: 12.5 }}>
              Consultations
            </button>
            <span>›</span>
            <span>New Prescription</span>
          </div>
        </div>
        <div className="cons-header-actions">
          <button className="cons-btn" onClick={() => navigate(`/consultations/${context.appointment.appointmentId}`)}>
            <ChevronLeftIcon /> Back to Consultation
          </button>
          <button className="cons-btn" onClick={handleSaveDraft}>
            <SaveIcon /> Save as Draft
          </button>
          <button className="cons-btn primary" onClick={() => submit(false)} disabled={submitting}>
            <SendIcon /> {submitting ? 'Sending…' : 'Send to Pharmacy'}
          </button>
        </div>
      </div>

      {draftSavedAt && (
        <div className="rxb-banner success">
          <span className="rxb-banner-icon">
            <CheckCircleIcon />
          </span>
          <span className="rxb-banner-text">Draft saved locally at {draftSavedAt.toLocaleTimeString()}.</span>
        </div>
      )}
      {submitError && <div className="dash-error-banner">{submitError}</div>}
      {allergyConflicts && (
        <div className="rxb-banner error">
          <span className="rxb-banner-icon">
            <AlertIcon />
          </span>
          <span className="rxb-banner-text">
            <span className="rxb-banner-title">Allergy conflict: </span>
            {allergyConflicts.join(', ')} may conflict with this patient's documented allergies ({patient.allergies}).
          </span>
          <button className="cons-btn primary" onClick={() => submit(true)} disabled={submitting}>
            Acknowledge &amp; Send Anyway
          </button>
        </div>
      )}

      <div className="cons-banner">
        {patient.photo_url ? (
          <img className="cons-banner-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
        ) : (
          <div className="cons-banner-avatar">{initials(patient.full_name)}</div>
        )}
        <div>
          <div className="cons-banner-name">{patient.full_name}</div>
          <div className="cons-banner-meta">
            {patient.gender}, {calculateAge(patient.dob)} Years
          </div>
          <div className="cons-banner-sub">
            {patient.patient_id} {patient.phone ? `· ${patient.phone}` : ''}
          </div>
        </div>
        <div className="cons-banner-divider" />
        <div className="cons-banner-fields">
          <div className="cons-banner-field">
            <span className="cons-banner-label">Diagnosis</span>
            <span className="cons-banner-value">{context.consultation.diagnosis || '—'}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Date</span>
            <span className="cons-banner-value">{new Date(context.appointment.scheduledAt).toLocaleDateString()}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Doctor</span>
            <span className="cons-banner-value">Dr. {context.appointment.doctor.username}</span>
          </div>
        </div>
      </div>

      <div className="cons-layout">
        <div>
          <div className="cons-box" style={{ marginBottom: 16 }}>
            <div className="cons-box-title">Prescription Details</div>

            <div className="rxb-search-row" ref={searchRef}>
              <div className="rxb-search-box">
                <SearchIcon />
                <input
                  placeholder="Search medicine by name, generic name…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                />
              </div>
              {searchOpen && (
                <div className="rxb-search-dropdown">
                  {searchResults.length === 0 && <div className="rxb-search-empty">No medicines found.</div>}
                  {searchResults.map((m) => (
                    <div className="rxb-search-result" key={m.medicine_id} onClick={() => addMedicine(m)}>
                      <div>
                        <div className="rxb-search-result-name">
                          {m.name} {m.strength && `(${m.strength})`}
                        </div>
                        <div className="rxb-search-result-meta">
                          {m.generic_name} · {m.form}
                        </div>
                      </div>
                      <span className={`badge ${m.stockStatus === 'in-stock' ? 'badge-green' : m.stockStatus === 'low' ? 'badge-amber' : 'badge-red'}`}>
                        {m.stockStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <table className="rxb-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine</th>
                  <th>Strength</th>
                  <th>Dose</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Quantity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="rxb-empty-table">No medicines added yet. Search above to add one.</div>
                    </td>
                  </tr>
                )}
                {items.map((it, i) => (
                  <tr key={it.key}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="rxb-med-name">{it.name}</div>
                      {it.generic_name && <div className="rxb-med-generic">{it.generic_name}</div>}
                    </td>
                    <td>{it.strength || '—'}</td>
                    <td>
                      <input className="rxb-table-input" value={it.dosage} onChange={updateItem(it.key, 'dosage')} placeholder="1 tablet" />
                    </td>
                    <td>
                      <input className="rxb-table-input" value={it.frequency} onChange={updateItem(it.key, 'frequency')} placeholder="TDS" />
                    </td>
                    <td>
                      <input className="rxb-table-input" value={it.duration} onChange={updateItem(it.key, 'duration')} placeholder="5 Days" />
                    </td>
                    <td>
                      <input className="rxb-table-input qty" type="number" min={1} value={it.qty} onChange={updateItem(it.key, 'qty')} />
                    </td>
                    <td>
                      <button className="pat-icon-btn" onClick={() => removeItem(it.key)} aria-label="Remove">
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {items.length > 0 && outOfStock.length === 0 && stockIssues.length === 0 && (
              <div className="rxb-banner success">
                <span className="rxb-banner-icon">
                  <CheckCircleIcon />
                </span>
                <span className="rxb-banner-text">
                  <span className="rxb-banner-title">Stock Availability: </span>All medicines are available in the pharmacy.
                </span>
              </div>
            )}
            {(outOfStock.length > 0 || stockIssues.length > 0) && (
              <div className="rxb-banner warning">
                <span className="rxb-banner-icon">
                  <AlertIcon />
                </span>
                <span className="rxb-banner-text">
                  <span className="rxb-banner-title">Stock Availability: </span>
                  {outOfStock.map((i) => i.name).join(', ')}
                  {outOfStock.length > 0 && stockIssues.length > 0 && '; '}
                  {stockIssues.map((i) => `${i.name} (only ${i.totalQty} in stock)`).join(', ')} — the pharmacist will re-check at dispense time.
                </span>
              </div>
            )}
          </div>

          <div className="cons-main">
            <div className="cons-box">
              <div className="cons-box-title">Additional Notes for Pharmacist</div>
              <textarea className="cons-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Please dispense generic medicines where possible." />
            </div>

            <div className="cons-box">
              <div className="cons-box-title">Prescription Type</div>
              <div className="rxb-radio-row">
                <label className="rxb-radio-option">
                  <input type="radio" checked={prescriptionType === 'new'} onChange={() => { setPrescriptionType('new'); setRepeatFromId(null); }} />
                  New Prescription
                </label>
                <label className="rxb-radio-option">
                  <input type="radio" checked={prescriptionType === 'repeat'} onChange={() => setPrescriptionType('repeat')} />
                  Repeat Previous Prescription
                </label>
                {prescriptionType === 'repeat' && (
                  <select
                    className="cons-select"
                    value={repeatFromId ?? ''}
                    onChange={(e) => applyPastPrescription(Number(e.target.value))}
                  >
                    <option value="">Select a previous prescription…</option>
                    {context.pastPrescriptions.map((p) => (
                      <option key={p.prescriptionId} value={p.prescriptionId}>
                        {p.code} — {formatDate(p.issuedAt)} ({p.items.length} medicines)
                      </option>
                    ))}
                  </select>
                )}
                {prescriptionType === 'repeat' && context.pastPrescriptions.length === 0 && (
                  <p className="fam-muted" style={{ fontSize: 12.5 }}>This patient has no previous prescriptions to repeat.</p>
                )}
              </div>
            </div>
          </div>

          <div className="cons-box" style={{ marginTop: 16 }}>
            <div className="cons-box-title">Prescribed By</div>
            <p style={{ fontSize: 13.5, color: '#334155', margin: 0 }}>
              Dr. {context.appointment.doctor.username}
              {context.appointment.doctor.registration_number && ` · Reg. No: ${context.appointment.doctor.registration_number}`}
            </p>
          </div>

          <div className="cons-header-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="cons-btn" onClick={() => window.print()}>
              <PrintIcon /> Print
            </button>
            <button className="cons-btn" onClick={handleSaveDraft}>
              <SaveIcon /> Save as Draft
            </button>
            <button className="cons-btn primary" onClick={() => submit(false)} disabled={submitting}>
              <SendIcon /> {submitting ? 'Sending…' : 'Send to Pharmacy'}
            </button>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Prescription Summary</h3>
            </div>
            <div className="rxb-summary-row">
              <span className="rxb-summary-label">Total Medicines</span>
              <span className="rxb-summary-value">{items.length}</span>
            </div>
            <div className="rxb-summary-row">
              <span className="rxb-summary-label">Total Quantity</span>
              <span className="rxb-summary-value">{totalQuantity}</span>
            </div>
            <div className="rxb-summary-row">
              <span className="rxb-summary-label">Prescription Type</span>
              <span className="badge badge-blue">{prescriptionType === 'repeat' ? 'Repeat' : 'New'}</span>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Allergies &amp; Conditions</h3>
            </div>
            <div className="cons-side-item">
              <span className="cons-side-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                <AlertIcon />
              </span>
              <div>
                <div className="cons-side-label">Allergies</div>
                <div className="cons-side-value">{context.patientSummary.allergies || 'None recorded'}</div>
              </div>
            </div>
            {context.patientSummary.chronicConditions.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="cons-side-label" style={{ marginBottom: 6 }}>
                  Chronic Conditions
                </div>
                <div className="cons-chips">
                  {context.patientSummary.chronicConditions.map((c) => (
                    <span className="cons-chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Prescriptions</h3>
            </div>
            {context.pastPrescriptions.length === 0 && <div className="card-empty">No previous prescriptions.</div>}
            {context.pastPrescriptions.slice(0, 5).map((p) => (
              <div className="cons-recent-row" key={p.prescriptionId}>
                <span className="cons-recent-diagnosis">
                  {p.code} · {p.items.length} Medicines
                </span>
                <span className="cons-recent-date">{formatDate(p.issuedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewPrescription;
