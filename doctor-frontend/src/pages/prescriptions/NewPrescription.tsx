import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { getPrescriptionContext, createPrescription, downloadPrescriptionPdf } from '../../lib/prescriptions';
import type { PrescriptionItemInput } from '../../lib/prescriptions';
import { listConsultations } from '../../lib/consultations';
import { calculateAge } from '../../lib/queue';
import {
  PrintIcon,
  SaveIcon,
  SendIcon,
  SearchIcon,
  TrashIcon,
  AlertIcon,
  CheckCircleIcon,
  ClipboardIcon,
  DownloadIcon,
  PlusIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import './prescriptions.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const rxCode = (id: number) => `RX${String(id).padStart(6, '0')}`;

const FREQUENCY_OPTIONS = ['OD - Once Daily', 'BD - Twice Daily', 'TDS - Three times daily', 'QID - Four times daily', 'PRN - As needed', 'STAT', 'HS - At bedtime'];
const DURATION_OPTIONS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month', 'Ongoing'];
const ROUTE_OPTIONS = ['Oral', 'Topical', 'IV', 'IM', 'SC', 'Sublingual', 'Rectal', 'Inhalation', 'Ophthalmic', 'Otic'];

interface DraftItem {
  key: string;
  medicine_id: number;
  name: string;
  generic_name: string | null;
  strength: string | null;
  form: string | null;
  category: string | null;
  unit: string;
  totalQty: number;
  stockStatus: Medicine['stockStatus'];
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  qty: string;
}

const draftKey = (consultationId: number) => `epoch_doctor_rx_draft_${consultationId}`;

// Landing view when no consultation is specified — lets the doctor pick from their own
// in-progress (Draft) consultations, since a prescription is normally written during one.
const PrescriptionPicker = () => {
  const navigate = useNavigate();
  const { data: result, loading } = useApiData(() => listConsultations({ status: 'Draft', limit: 50 }));
  const drafts = result?.data ?? [];

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;

  if (drafts.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <ClipboardIcon />
        <h3 style={{ margin: '12px 0 4px', color: '#334155' }}>No in-progress consultation to prescribe for</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>Start or resume a consultation first, then prescribe from there.</p>
        <button className="pat-btn primary" onClick={() => navigate('/queue/call-next')}>
          Go to Call Next
        </button>
      </div>
    );
  }

  return (
    <div className="pat-table-card">
      <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Choose a consultation to prescribe for</h3>
      </div>
      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date</th>
              <th>Diagnosis</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((c) => (
              <tr key={c.consultationId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.patientName}</div>
                  <span className="pat-muted" style={{ fontSize: 11.5 }}>
                    {c.patientId}
                  </span>
                </td>
                <td>{formatDate(c.createdAt)}</td>
                <td>{c.diagnosis || '—'}</td>
                <td>
                  <button className="pat-btn primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => navigate(`/prescriptions/new/${c.consultationId}`)}>
                    Prescribe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const NewPrescription = () => {
  const { consultationId } = useParams();
  if (!consultationId) return <PrescriptionPicker />;
  return <Builder consultationId={Number(consultationId)} />;
};

const Builder = ({ consultationId }: { consultationId: number }) => {
  const navigate = useNavigate();
  const { data: context, loading, error } = useApiData(() => getPrescriptionContext(consultationId), [consultationId]);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [allergyAck, setAllergyAck] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: number; code: string } | null>(null);

  // There's no server-side Draft status for prescriptions — they're created atomically once
  // sent — so "Save as Draft" persists to localStorage instead, same convention as the admin app.
  useEffect(() => {
    const raw = localStorage.getItem(draftKey(consultationId));
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setItems(saved.items ?? []);
        setNotes(saved.notes ?? '');
      } catch {
        /* ignore corrupt draft */
      }
    }
  }, [consultationId]);

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
        form: m.form,
        category: m.category,
        unit: m.unit,
        totalQty: m.totalQty,
        stockStatus: m.stockStatus,
        dosage: m.strength || '1 ' + m.unit,
        frequency: '',
        duration: '',
        route: '',
        instructions: '',
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

  const handleSaveDraft = () => {
    localStorage.setItem(draftKey(consultationId), JSON.stringify({ items, notes }));
    setDraftSavedAt(new Date());
  };

  const handleClearAll = () => {
    setItems([]);
    setNotes('');
    localStorage.removeItem(draftKey(consultationId));
  };

  const buildItemsInput = (): PrescriptionItemInput[] =>
    items.map((i) => ({
      medicine_id: i.medicine_id,
      dosage: i.dosage,
      frequency: i.frequency || undefined,
      duration: i.duration || undefined,
      route: i.route || undefined,
      instructions: i.instructions || undefined,
      qty: Number(i.qty) || 1,
    }));

  // Live allergy check — same substring match the backend runs authoritatively at submit time;
  // this is purely a heads-up before sending, not a second source of truth.
  const allergyText = (context?.appointment.patient.allergies || '').toLowerCase().trim();
  const allergyConflictItems = allergyText
    ? items.filter((i) => allergyText.includes(i.name.toLowerCase()) || (i.generic_name && allergyText.includes(i.generic_name.toLowerCase())))
    : [];

  // React state updates aren't applied synchronously, so `disabled={submitting}` alone can't
  // stop a second click (or an impatient double-click) that lands before the re-render — this
  // ref-based lock closes that window immediately, independent of React's render cycle.
  const submittingRef = useRef(false);

  const submit = async () => {
    if (submittingRef.current) return;
    if (items.length === 0) {
      setSubmitError('Add at least one medicine before submitting.');
      return;
    }
    if (allergyConflictItems.length > 0 && !allergyAck) {
      setSubmitError('Acknowledge the allergy alert below before submitting.');
      return;
    }
    submittingRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await createPrescription({
        consultation_id: consultationId,
        items: buildItemsInput(),
        allergyAck,
        notes: notes || undefined,
      });
      localStorage.removeItem(draftKey(consultationId));
      setSubmitted({ id: res.data.prescription_id, code: rxCode(res.data.prescription_id) });
    } catch (err: any) {
      if (err.response?.status === 409 && err.response.data?.conflicts) {
        setSubmitError(`Allergy conflict: ${err.response.data.conflicts.join(', ')} — tick "Acknowledge" below and submit again.`);
      } else {
        setSubmitError(err.response?.data?.message || 'Failed to submit prescription.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const { patient } = context.appointment;
  const totalQuantity = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  const visitType = context.patientSummary.priorVisitCount > 0 ? 'Return Visit' : 'New Visit';

  const stockIssues = items.filter((i) => i.totalQty > 0 && i.totalQty < Number(i.qty));
  const outOfStock = items.filter((i) => i.totalQty === 0);

  if (submitted) {
    return (
      <div>
        <div className="card rxp-success" style={{ maxWidth: 480, margin: '40px auto' }}>
          <div className="rxp-success-icon">
            <CheckCircleIcon />
          </div>
          <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Prescription Submitted</h2>
          <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 20px' }}>
            {submitted.code} has been sent to the pharmacy for {patient.full_name}.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="cons-btn" onClick={() => downloadPrescriptionPdf(submitted.id, submitted.code)}>
              <DownloadIcon /> Download PDF
            </button>
            <button className="cons-btn primary" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
              Back to Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>New Prescription</h1>
          <p>Create and send a prescription to the pharmacy.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            Cancel
          </button>
          <button className="pat-btn" onClick={handleSaveDraft}>
            <SaveIcon /> Save as Draft
          </button>
          <button className="pat-btn primary" onClick={submit} disabled={submitting}>
            <SendIcon /> {submitting ? 'Submitting…' : 'Submit Prescription'}
          </button>
        </div>
      </div>

      {draftSavedAt && (
        <div className="rxb-banner success">
          <span className="rxb-banner-icon">
            <CheckCircleIcon />
          </span>
          <span className="rxb-banner-text">Draft saved locally at {formatTime(draftSavedAt)}.</span>
        </div>
      )}
      {submitError && <div className="dash-error-banner">{submitError}</div>}

      <div className="cons-box" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {patient.photo_url ? (
            <img className="cons-banner-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
          ) : (
            <div className="cons-banner-avatar">{initials(patient.full_name)}</div>
          )}
          <div>
            <div className="cons-banner-name">{patient.full_name}</div>
            <div className="cons-banner-meta">
              MRN: {patient.patient_id} · {calculateAge(patient.dob)} Y / {patient.gender}
            </div>
            {patient.phone && <div className="cons-banner-sub">{patient.phone}</div>}
          </div>
        </div>

        <div className="rxp-field-grid">
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Visit Date &amp; Time</div>
            <div className="rxp-field-box-value">{formatDateTime(context.appointment.scheduledAt)}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Visit Type</div>
            <div className="rxp-field-box-value">{visitType}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Attending Doctor</div>
            <div className="rxp-field-box-value">Dr. {context.appointment.doctor.username}</div>
          </div>
        </div>
      </div>

      <div className="cons-layout">
        <div>
          <div className="cons-box" style={{ marginBottom: 16 }}>
            <div className="cons-box-title">Prescription Items</div>

            <div className="rxb-search-row" ref={searchRef}>
              <div className="rxb-search-box">
                <SearchIcon />
                <input
                  ref={searchInputRef}
                  placeholder="Search medicine by name, generic name or category…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                />
              </div>
              <button type="button" className="cons-btn" onClick={() => searchInputRef.current?.focus()}>
                <PlusIcon /> Add Medicine
              </button>
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
                          {m.generic_name} · {[m.form, m.category].filter(Boolean).join(' · ')}
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
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Route</th>
                  <th>Qty</th>
                  <th>Instructions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="rxb-empty-table">No medicines added yet. Search above to add one.</div>
                    </td>
                  </tr>
                )}
                {items.map((it, i) => (
                  <tr key={it.key}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="rxb-med-name">{it.name}</div>
                      <div className="rxb-med-generic">{[it.form, it.category].filter(Boolean).join(' · ') || it.generic_name}</div>
                    </td>
                    <td>
                      <input className="rxb-table-input" value={it.dosage} onChange={updateItem(it.key, 'dosage')} placeholder="500 mg" />
                    </td>
                    <td>
                      <input className="rxb-table-input" list="rxp-frequency-options" value={it.frequency} onChange={updateItem(it.key, 'frequency')} placeholder="TDS" />
                    </td>
                    <td>
                      <input className="rxb-table-input" list="rxp-duration-options" value={it.duration} onChange={updateItem(it.key, 'duration')} placeholder="5 Days" />
                    </td>
                    <td>
                      <input className="rxb-table-input" list="rxp-route-options" value={it.route} onChange={updateItem(it.key, 'route')} placeholder="Oral" />
                    </td>
                    <td>
                      <input className="rxb-table-input qty" type="number" min={1} value={it.qty} onChange={updateItem(it.key, 'qty')} />
                    </td>
                    <td>
                      <input className="rxb-table-input" value={it.instructions} onChange={updateItem(it.key, 'instructions')} placeholder="After food" />
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
            <datalist id="rxp-frequency-options">
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <datalist id="rxp-duration-options">
              {DURATION_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <datalist id="rxp-route-options">
              {ROUTE_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <button type="button" className="pat-btn" style={{ fontSize: 12.5, padding: '7px 12px' }} onClick={() => searchInputRef.current?.focus()}>
                <PlusIcon /> Add Medicine
              </button>
              <span className="pat-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>
                Total Items: {items.length}
              </span>
            </div>

            {items.length > 0 && outOfStock.length === 0 && stockIssues.length === 0 && (
              <div className="rxb-banner success">
                <span className="rxb-banner-icon">
                  <CheckCircleIcon />
                </span>
                <span className="rxb-banner-text">
                  <span className="rxb-banner-title">Stock Availability: </span>All medicines are available in stock and not expired.
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

            <div className="rxp-notes-row">
              <div>
                <div className="cons-box-title" style={{ marginBottom: 6 }}>
                  Notes to Pharmacist
                </div>
                <textarea
                  className="cons-textarea"
                  rows={4}
                  maxLength={200}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Please dispense generic medicines where possible."
                />
                <div className="rxp-char-count">{notes.length} / 200 characters</div>
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 6 }}>
                  Diagnosis (ICD-10)
                </div>
                <div className="rxp-field-box" style={{ minHeight: 66 }}>
                  <div className="rxp-field-box-value">
                    {context.consultation.diagnosis
                      ? `${context.consultation.icd10Code ? `${context.consultation.icd10Code} - ` : ''}${context.consultation.diagnosis}`
                      : 'No diagnosis recorded on this consultation'}
                  </div>
                </div>
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 6 }}>
                  Allergy Check
                </div>
                {allergyConflictItems.length === 0 ? (
                  <div className="rxp-alert-box ok">
                    <span className="rxp-alert-title">
                      <CheckCircleIcon /> No known drug allergies
                    </span>
                    <span className="rxp-alert-body">{patient.allergies ? 'No conflicts with the current items.' : 'No allergies recorded for this patient.'}</span>
                  </div>
                ) : (
                  <div className="rxp-alert-box warn">
                    <span className="rxp-alert-title">
                      <AlertIcon /> Allergy conflict
                    </span>
                    <span className="rxp-alert-body">
                      {allergyConflictItems.map((i) => i.name).join(', ')} may conflict with a documented allergy ({patient.allergies}).
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                      <input type="checkbox" checked={allergyAck} onChange={(e) => setAllergyAck(e.target.checked)} />
                      Acknowledge and proceed
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rxp-footer">
            <div className="rxp-footer-meta">
              <span>Created by: Dr. {context.appointment.doctor.username}</span>
              {draftSavedAt && <span>Draft saved at {formatTime(draftSavedAt)}</span>}
            </div>
            <div className="rxp-footer-actions">
              <button className="cons-btn" onClick={handleClearAll}>
                Clear All
              </button>
              <button className="cons-btn" onClick={() => window.print()}>
                <PrintIcon /> Print
              </button>
              <button className="cons-btn primary" onClick={submit} disabled={submitting}>
                <SendIcon /> {submitting ? 'Submitting…' : 'Submit Prescription'}
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Patient Summary</h3>
            </div>
            <div className="rxp-summary-item">
              <span className="rxp-summary-item-label">Blood Group</span>
              <span className="rxp-summary-item-value">{patient.blood_group || '—'}</span>
            </div>
            <div className="rxp-summary-item">
              <span className="rxp-summary-item-label">Known Allergies</span>
              <span className={`rxp-summary-item-value${patient.allergies ? '' : ' muted'}`}>{patient.allergies || 'None recorded'}</span>
            </div>
            <div className="rxp-summary-item">
              <span className="rxp-summary-item-label">Chronic Conditions</span>
              <span className={`rxp-summary-item-value${context.patientSummary.chronicConditions.length ? '' : ' muted'}`}>
                {context.patientSummary.chronicConditions.join(', ') || 'None'}
              </span>
            </div>
            <div className="rxp-summary-item">
              <span className="rxp-summary-item-label">Current Medications</span>
              <span className={`rxp-summary-item-value${context.patientSummary.currentMedications.length ? '' : ' muted'}`}>
                {context.patientSummary.currentMedications.join(', ') || 'None'}
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="card-link" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
                View Full Record →
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Stock Status</h3>
            </div>
            {items.length === 0 && <div className="card-empty">Add medicines to see stock levels.</div>}
            {items.map((it) => (
              <div className="rxp-stock-row" key={it.key}>
                <span className="rxp-stock-name">
                  {it.stockStatus === 'in-stock' ? (
                    <span style={{ color: '#16a34a' }}>
                      <CheckCircleIcon />
                    </span>
                  ) : (
                    <span style={{ color: it.stockStatus === 'low' ? '#b45309' : '#dc2626' }}>
                      <AlertIcon />
                    </span>
                  )}
                  {it.name}
                </span>
                <span className={`rxp-stock-qty ${it.stockStatus}`}>
                  {it.totalQty > 0 ? `In Stock (${it.totalQty})` : 'Out of Stock'}
                </span>
              </div>
            ))}
          </div>

          <div className="rxp-preview-box">
            <div className="rxp-preview-title">Prescription Preview</div>
            {submitted ? 'A PDF is ready to download above.' : 'A PDF will be available to download once you submit this prescription.'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewPrescription;
