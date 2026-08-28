import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { getPrescriptionContext, createPrescription, downloadPrescriptionPdf, downloadExternalPurchaseSlip, displayPrescriptionPatient } from '../../lib/prescriptions';
import type { PrescriptionItemInput, PrescriptionItem } from '../../lib/prescriptions';
import { bulkCreateExternalMedicines, previewExternalMedicineSlip } from '../../lib/externalMedicines';
import { listConsultations } from '../../lib/consultations';
import { calculateAge } from '../../lib/queue';
import InstructionsPicker from '../../components/InstructionsPicker';
import ExternalMedicineSection, { draftToInput } from './ExternalMedicineSection';
import type { ExternalMedicineDraft, ShortfallPrefill } from './ExternalMedicineSection';
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

// Mirrored server-side in backend/src/modules/prescriptions/qtyCalc.ts — this copy drives instant
// UI calculation, the backend copy is the authoritative check at submit time. Returns null when
// the qty can't be mechanically derived (PRN, "Ongoing", or any non-matching free text), in which
// case Qty stays a manually-entered field instead of an auto-calculated read-only one.
const DAILY_FREQUENCY: Record<string, number | null> = { OD: 1, BD: 2, TDS: 3, QID: 4, STAT: 1, HS: 1, PRN: null };
const computeExpectedQty = (frequency?: string, duration?: string): number | null => {
  const code = frequency?.trim().toUpperCase().match(/^(OD|BD|TDS|QID|STAT|HS|PRN)\b/)?.[1];
  if (!code) return null;
  if (code === 'STAT') return 1;
  const daily = DAILY_FREQUENCY[code];
  if (daily === null || daily === undefined) return null;
  const d = duration?.trim() ?? '';
  const dayMatch = d.match(/^(\d+)\s*Days?$/i);
  const monthMatch = d.match(/^(\d+)\s*Months?$/i);
  const days = dayMatch ? Number(dayMatch[1]) : monthMatch ? Number(monthMatch[1]) * 30 : null;
  if (days === null) return null;
  return daily * days;
};

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

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
  instructionChips: string[];
  qty: string;
  external_qty: number;
  sourceManual: boolean;
}

// Fills in defaults for drafts saved before external purchase/instructions-chips support existed,
// and reconstructs instruction chips from a legacy plain-text `instructions` string if present.
const normalizeItem = (it: any): DraftItem => ({
  ...it,
  external_qty: it.external_qty ?? 0,
  sourceManual: it.sourceManual ?? false,
  instructionChips: it.instructionChips ?? (it.instructions ? String(it.instructions).split(';').map((s: string) => s.trim()).filter(Boolean) : []),
});

// Recomputes external_qty from the current qty/totalQty unless the doctor has manually set the
// source for this row (sourceManual) — in which case we just clamp it back into [0, qty] so an
// edit to Frequency/Duration that shrinks qty can't leave external_qty larger than qty.
const recalcSource = (item: DraftItem): DraftItem => {
  const qtyNum = Number(item.qty) || 0;
  if (item.sourceManual) {
    return { ...item, external_qty: clamp(item.external_qty, 0, qtyNum) };
  }
  let external_qty = 0;
  if (item.totalQty === 0) external_qty = qtyNum;
  else if (item.totalQty < qtyNum) external_qty = qtyNum - item.totalQty;
  return { ...item, external_qty };
};

type StockBadge = { emoji: string; label: string; cls: string } | null;
const stockBadge = (item: DraftItem): StockBadge => {
  const qtyNum = Number(item.qty) || 0;
  if (item.totalQty === 0) return { emoji: '🔴', label: 'Not Available in Clinic', cls: 'red' };
  if (item.totalQty < qtyNum) return { emoji: '🟠', label: 'Insufficient Stock', cls: 'amber' };
  return null;
};
const sourceBadge = (item: DraftItem): { emoji: string; label: string; cls: string } => {
  const qtyNum = Number(item.qty) || 0;
  if (qtyNum > 0 && item.external_qty >= qtyNum) return { emoji: '🔵', label: 'External Purchase', cls: 'blue' };
  return { emoji: '🟢', label: 'Clinic Pharmacy', cls: 'green' };
};
const isSplit = (item: DraftItem) => item.totalQty > 0 && item.totalQty < (Number(item.qty) || 0);

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
  const [externalItems, setExternalItems] = useState<ExternalMedicineDraft[]>([]);
  const [shortfallPrefill, setShortfallPrefill] = useState<ShortfallPrefill | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [allergyAck, setAllergyAck] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: number; code: string; items: PrescriptionItem[]; hadExternalItems: boolean; externalSaved: boolean } | null>(
    null
  );
  const [externalSaveError, setExternalSaveError] = useState<string | null>(null);
  const [savingExternal, setSavingExternal] = useState(false);

  // There's no server-side Draft status for prescriptions — they're created atomically once
  // sent — so "Save as Draft" persists to localStorage instead, same convention as the admin app.
  useEffect(() => {
    const raw = localStorage.getItem(draftKey(consultationId));
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setItems((saved.items ?? []).map(normalizeItem));
        setNotes(saved.notes ?? '');
        setExternalItems(saved.externalItems ?? []);
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
      recalcSource({
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
        instructionChips: [],
        qty: '1',
        external_qty: 0,
        sourceManual: false,
      }),
    ]);
    setSearchTerm('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  const updateItem = (key: string, field: keyof DraftItem) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  };

  // Frequency/Duration changes ripple into Qty (when calculable) and then into external_qty
  // (unless the doctor has manually set a source for this row) — both recomputed in one pass.
  const updateFreqOrDuration = (key: string, field: 'frequency' | 'duration') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, [field]: value };
        const expected = computeExpectedQty(updated.frequency, updated.duration);
        return recalcSource({ ...updated, qty: expected !== null ? String(expected) : updated.qty });
      })
    );
  };

  const updateQtyManual = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? recalcSource({ ...it, qty: value }) : it)));
  };

  const setSource = (key: string, source: 'Clinic' | 'External') =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const qtyNum = Number(it.qty) || 0;
        return { ...it, sourceManual: true, external_qty: source === 'External' ? qtyNum : 0 };
      })
    );

  const setClinicDispense = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const qtyNum = Number(it.qty) || 0;
        const clinicDispense = clamp(Number(e.target.value) || 0, 0, qtyNum);
        return { ...it, sourceManual: true, external_qty: qtyNum - clinicDispense };
      })
    );

  const setExternalPurchaseQty = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const qtyNum = Number(it.qty) || 0;
        return { ...it, sourceManual: true, external_qty: clamp(Number(e.target.value) || 0, 0, qtyNum) };
      })
    );

  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const handleSaveDraft = () => {
    localStorage.setItem(draftKey(consultationId), JSON.stringify({ items, notes, externalItems }));
    setDraftSavedAt(new Date());
  };

  const handleClearAll = () => {
    setItems([]);
    setExternalItems([]);
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
      instructions: i.instructionChips.length ? i.instructionChips.join('; ') : undefined,
      qty: Number(i.qty) || 1,
      external_qty: i.external_qty || 0,
    }));

  // Live allergy check — same substring match the backend runs authoritatively at submit time;
  // this is purely a heads-up before sending, not a second source of truth.
  const allergyText = (context?.appointment.patient?.allergies || '').toLowerCase().trim();
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

      const hadExternalItems = externalItems.length > 0;
      let externalSaved = true;
      if (hadExternalItems) {
        try {
          await bulkCreateExternalMedicines(res.data.prescription_id, externalItems.map(draftToInput));
        } catch (extErr: any) {
          // The clinic prescription is already saved — never lose that. Keep the drafted external
          // items on screen with a retry option rather than silently dropping the doctor's work.
          externalSaved = false;
          setExternalSaveError(extErr.response?.data?.message || 'Failed to save the external medicines — use Retry below.');
        }
      }
      setSubmitted({ id: res.data.prescription_id, code: rxCode(res.data.prescription_id), items: res.data.items, hadExternalItems, externalSaved });
      if (externalSaved) setExternalItems([]);
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

  const retrySaveExternal = async () => {
    if (!submitted) return;
    setSavingExternal(true);
    setExternalSaveError(null);
    try {
      await bulkCreateExternalMedicines(submitted.id, externalItems.map(draftToInput));
      setSubmitted({ ...submitted, externalSaved: true });
      setExternalItems([]);
    } catch (err: any) {
      setExternalSaveError(err.response?.data?.message || 'Still failed to save the external medicines.');
    } finally {
      setSavingExternal(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const patient = displayPrescriptionPatient(context);
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
            {submitted.code} has been sent to the pharmacy for {patient.fullName}.
          </p>

          {!submitted.externalSaved && (
            <div className="dash-error-banner" style={{ textAlign: 'left', marginBottom: 16 }}>
              {externalSaveError}
              <button className="pat-btn" style={{ marginLeft: 10 }} onClick={retrySaveExternal} disabled={savingExternal}>
                {savingExternal ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="cons-btn" onClick={() => downloadPrescriptionPdf(submitted.id, submitted.code)}>
              <DownloadIcon /> Download PDF
            </button>
            {submitted.items.some((i) => i.external_qty > 0) && (
              <button className="cons-btn" onClick={() => downloadExternalPurchaseSlip(submitted.id)}>
                <PrintIcon /> Generate External Purchase Slip
              </button>
            )}
            {submitted.hadExternalItems && submitted.externalSaved && (
              <button className="cons-btn" onClick={() => previewExternalMedicineSlip(submitted.id)}>
                <PrintIcon /> Print External Medicine Slip
              </button>
            )}
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
          {patient.photoUrl ? (
            <img className="cons-banner-avatar" src={fileUrl(patient.photoUrl)} alt={patient.fullName} />
          ) : (
            <div className="cons-banner-avatar">{initials(patient.fullName)}</div>
          )}
          <div>
            <div className="cons-banner-name">
              {patient.fullName} {patient.isTemporary && <span className="badge badge-amber">Temporary / Unregistered</span>}
            </div>
            <div className="cons-banner-meta">
              MRN: {patient.patientId ?? 'Temporary — Today Only'} ·{' '}
              {patient.dob ? `${calculateAge(patient.dob)} Y` : patient.approxAge ? `~${patient.approxAge} Y` : '—'} / {patient.gender ?? '—'}
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
              <button
                type="button"
                className="cons-btn"
                onClick={() => {
                  searchInputRef.current?.focus();
                  setSearchOpen(true);
                }}
              >
                <PlusIcon /> Add Medicine
              </button>
              {searchOpen && (
                <div className="rxb-search-dropdown">
                  {searchTerm.trim().length < 2 && <div className="rxb-search-empty">Type at least 2 characters to search…</div>}
                  {searchTerm.trim().length >= 2 && searchResults.length === 0 && <div className="rxb-search-empty">No medicines found.</div>}
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
                {items.map((it, i) => {
                  const qtyNum = Number(it.qty) || 0;
                  const expectedQty = computeExpectedQty(it.frequency, it.duration);
                  const badge = stockBadge(it) ?? sourceBadge(it);
                  const split = isSplit(it);
                  return (
                    <tr key={it.key} className={it.external_qty > 0 ? 'rxb-row-external' : undefined}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="rxb-med-name">{it.name}</div>
                        <div className="rxb-med-generic">{[it.form, it.category].filter(Boolean).join(' · ') || it.generic_name}</div>
                        <div className="rxp-source-block">
                          <div className="rxp-source-meta">
                            Clinic Stock: <strong>{it.totalQty}</strong> · Required Qty: <strong>{qtyNum}</strong>
                          </div>
                          <span className={`rxp-source-badge ${badge.cls}`}>
                            {badge.emoji} {badge.label}
                          </span>
                          {split ? (
                            <div className="rxp-split-row">
                              <label>
                                Clinic Dispense
                                <input type="number" min={0} max={qtyNum} value={qtyNum - it.external_qty} onChange={setClinicDispense(it.key)} />
                              </label>
                              <label>
                                External Purchase
                                <input type="number" min={0} max={qtyNum} value={it.external_qty} onChange={setExternalPurchaseQty(it.key)} />
                              </label>
                            </div>
                          ) : (
                            <select
                              className="rxp-source-select"
                              value={qtyNum > 0 && it.external_qty >= qtyNum ? 'External' : 'Clinic'}
                              onChange={(e) => setSource(it.key, e.target.value as 'Clinic' | 'External')}
                            >
                              <option value="Clinic">Clinic Pharmacy</option>
                              <option value="External">External Purchase</option>
                            </select>
                          )}
                          {stockBadge(it) && (
                            <button
                              type="button"
                              className="rxp-add-external-btn"
                              onClick={() =>
                                setShortfallPrefill({
                                  medicine_id: it.medicine_id,
                                  medicine_name: it.name,
                                  generic_name: it.generic_name,
                                  dosage_form: it.form,
                                  strength: it.strength,
                                  dosage: it.dosage,
                                  frequency: it.frequency,
                                  duration: it.duration,
                                  quantity: Math.max(qtyNum - it.totalQty, 1),
                                  quantity_unit: it.unit,
                                })
                              }
                            >
                              <PlusIcon /> Add to External Medicines
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <input className="rxb-table-input" value={it.dosage} onChange={updateItem(it.key, 'dosage')} placeholder="500 mg" />
                      </td>
                      <td>
                        <input
                          className="rxb-table-input"
                          list="rxp-frequency-options"
                          value={it.frequency}
                          onChange={updateFreqOrDuration(it.key, 'frequency')}
                          placeholder="TDS"
                        />
                      </td>
                      <td>
                        <input
                          className="rxb-table-input"
                          list="rxp-duration-options"
                          value={it.duration}
                          onChange={updateFreqOrDuration(it.key, 'duration')}
                          placeholder="5 Days"
                        />
                      </td>
                      <td>
                        <input className="rxb-table-input" list="rxp-route-options" value={it.route} onChange={updateItem(it.key, 'route')} placeholder="Oral" />
                      </td>
                      <td>
                        {expectedQty !== null ? (
                          <input className="rxb-table-input qty" type="number" value={it.qty} disabled title="Auto calculated from Frequency × Duration" />
                        ) : (
                          <>
                            <input className="rxb-table-input qty" type="number" min={1} value={it.qty} onChange={updateQtyManual(it.key)} />
                            <div className="rxp-manual-badge">Manual</div>
                          </>
                        )}
                      </td>
                      <td>
                        <InstructionsPicker
                          chips={it.instructionChips}
                          onChange={(chips) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, instructionChips: chips } : x)))}
                        />
                      </td>
                      <td>
                        <button className="pat-icon-btn" onClick={() => removeItem(it.key)} aria-label="Remove">
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
              <button
                type="button"
                className="pat-btn"
                style={{ fontSize: 12.5, padding: '7px 12px' }}
                onClick={() => {
                  searchInputRef.current?.focus();
                  setSearchOpen(true);
                }}
              >
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
                    <span className="rxp-alert-body">
                      {context.patientSummary.allergies ? 'No conflicts with the current items.' : 'No allergies recorded for this patient.'}
                    </span>
                  </div>
                ) : (
                  <div className="rxp-alert-box warn">
                    <span className="rxp-alert-title">
                      <AlertIcon /> Allergy conflict
                    </span>
                    <span className="rxp-alert-body">
                      {allergyConflictItems.map((i) => i.name).join(', ')} may conflict with a documented allergy ({context.patientSummary.allergies}).
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

          <ExternalMedicineSection
            items={externalItems}
            onChange={setExternalItems}
            prefillRequest={shortfallPrefill}
            onPrefillConsumed={() => setShortfallPrefill(null)}
          />

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
              <span className="rxp-summary-item-value">{patient.bloodGroup || '—'}</span>
            </div>
            <div className="rxp-summary-item">
              <span className="rxp-summary-item-label">Known Allergies</span>
              <span className={`rxp-summary-item-value${context.patientSummary.allergies ? '' : ' muted'}`}>{context.patientSummary.allergies || 'None recorded'}</span>
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

          {items.some((i) => i.external_qty > 0) && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title">External Purchase Slip Preview</h3>
              </div>
              {items
                .filter((i) => i.external_qty > 0)
                .map((i) => (
                  <div className="rxp-stock-row" key={i.key}>
                    <span className="rxp-stock-name">{i.name}</span>
                    <span className="rxp-stock-qty blue">
                      Qty {i.external_qty}
                      {i.external_qty < (Number(i.qty) || 0) ? ' (partial)' : ''}
                    </span>
                  </div>
                ))}
              <p className="pat-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                Available to print as a separate slip once this prescription is submitted.
              </p>
            </div>
          )}

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
