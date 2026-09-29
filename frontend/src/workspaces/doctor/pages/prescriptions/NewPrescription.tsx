import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { draftKey as scopedDraftKey } from '../../lib/drafts';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { getPrescriptionContext, createPrescription, displayPrescriptionPatient } from '../../lib/prescriptions';
import type { PrescriptionItemInput } from '../../lib/prescriptions';
import { bulkCreateExternalMedicines } from '../../lib/externalMedicines';
import { finalizeConsultation } from '../../lib/consultations';
import { getClinicSettings } from '../../lib/settings';
import { listConsultations } from '../../lib/consultations';
import { calculateAge } from '../../lib/queue';
import InstructionsPicker from '../../components/InstructionsPicker';
import ExternalMedicineSection, { draftToInput } from './ExternalMedicineSection';
import type { ExternalMedicineDraft, ShortfallPrefill } from './ExternalMedicineSection';
import {
  PrintIcon,
  SaveIcon,
  SearchIcon,
  TrashIcon,
  AlertIcon,
  CheckCircleIcon,
  ClipboardIcon,
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

const FREQUENCY_OPTIONS = ['OD - Once Daily', 'BD - Twice Daily', 'TDS - Three times daily', 'QID - Four times daily', 'PRN - As needed', 'STAT', 'HS - At bedtime'];
const DURATION_OPTIONS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month', 'Ongoing'];
const ROUTE_OPTIONS = ['Oral', 'Topical', 'IV', 'IM', 'SC', 'Sublingual', 'Rectal', 'Inhalation', 'Ophthalmic', 'Otic'];

// Mirrored server-side in backend/src/modules/prescriptions/qtyCalc.ts — this copy drives instant
// UI calculation, the backend copy is the authoritative check at submit time and REJECTS a qty
// that disagrees, so the two must stay byte-for-byte equivalent. Returns null when the qty can't
// be mechanically derived, in which case Qty stays a manually-entered field.
// Latin/─prescribing shorthand → doses per day. `null` means deliberately not calculable.
const DOSE_CODES: Record<string, number | null> = {
  OD: 1, // once daily
  OM: 1, // omni mane — each morning
  ON: 1, // omni nocte — each night
  HS: 1, // hora somni — at bedtime
  NOCTE: 1,
  MANE: 1,
  DAILY: 1,
  BD: 2, // bis die
  BID: 2,
  TDS: 3, // ter die sumendus
  TID: 3,
  QDS: 4, // quater die sumendus — the common British/Sri Lankan form
  QID: 4,
  PRN: null, // as needed
  SOS: null, // si opus sit — if required
};

const MAX_DAYS = 365;

/** Doses per day, or null when the frequency is as-needed or not recognised. */
const dosesPerDay = (frequency?: string): number | null => {
  const text = (frequency ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/\b(PRN|SOS)\b|AS\s+(NEEDED|REQUIRED)|WHEN\s+(NEEDED|REQUIRED)/.test(text)) return null;

  // "q6h", "every 8 hours" — only when the interval divides a day evenly.
  const hourly = text.match(/\bQ\s*(\d{1,2})\s*H\b/) ?? text.match(/\bEVERY\s+(\d{1,2})\s*(?:H|HRS?|HOURS?)\b/);
  if (hourly) {
    const hours = Number(hourly[1]);
    return hours > 0 && hours <= 24 && 24 % hours === 0 ? 24 / hours : null;
  }

  // "3 times daily", "3 times a day", "3x per day".
  const times = text.match(/\b(\d{1,2})\s*(?:X|TIMES?)\s*(?:A\s+|PER\s+)?DAY(?:LY)?\b/);
  if (times) {
    const n = Number(times[1]);
    return n >= 1 && n <= 24 ? n : null;
  }

  // Worded forms, checked before the codes so "TDS - Three times daily" agrees either way.
  if (/\bONCE\b/.test(text)) return 1;
  if (/\bTWICE\b/.test(text)) return 2;
  if (/\bTHRICE\b|\bTHREE\s+TIMES\b/.test(text)) return 3;
  if (/\bFOUR\s+TIMES\b/.test(text)) return 4;

  // Leading shorthand code, e.g. "BD", "TDS - Three times daily", "BD x 5/7".
  const code = text.match(/^([A-Z]+)\b/)?.[1];
  if (code && Object.prototype.hasOwnProperty.call(DOSE_CODES, code)) return DOSE_CODES[code];
  return null;
};

/** Course length in days, or null when it is open-ended or not recognised. */
const parseDurationDays = (duration?: string): number | null => {
  const text = (duration ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/ONGOING|CONTINUOUS|LONG[\s-]?TERM|INDEFINITE|UNTIL/.test(text)) return null;

  // Prescribing shorthand: 5/7 = 5 days, 2/52 = 2 weeks, 3/12 = 3 months.
  const shorthand = text.match(/^(\d{1,3})\s*\/\s*(7|52|12)$/);
  if (shorthand) {
    const n = Number(shorthand[1]);
    const days = shorthand[2] === '7' ? n : shorthand[2] === '52' ? n * 7 : n * 30;
    return days >= 1 && days <= MAX_DAYS ? days : null;
  }

  // "5 days", "2 weeks", "1 month", or a bare number read as days.
  const m = text.match(/^(\d{1,3})\s*(DAYS?|D|WEEKS?|WKS?|W|MONTHS?|MTHS?|M)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 'DAYS';
  const perUnit = /^(WEEKS?|WKS?|W)$/.test(unit) ? 7 : /^(MONTHS?|MTHS?|M)$/.test(unit) ? 30 : 1;
  const days = n * perUnit;
  return days >= 1 && days <= MAX_DAYS ? days : null;
};

/** Doses per day and course length, for callers that want to explain the arithmetic. */
const parseSchedule = (frequency?: string, duration?: string) => ({
  perDay: dosesPerDay(frequency),
  days: parseDurationDays(duration),
  /** STAT is a single dose — duration does not apply. */
  isStat: /^STAT\b/.test((frequency ?? '').trim().toUpperCase()),
});

// Total number of doses over the course (e.g. BD x 5 Days = 10), or null when the schedule can't
// be derived mechanically (PRN frequency, non-numeric duration like "Ongoing", or free text).
const scheduledDoseCount = (frequency?: string, duration?: string): number | null => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  if (isStat) return 1;
  if (perDay === null || days === null) return null;
  return perDay * days;
};

// Whole units to dispense, rounded UP so the patient is never short a fraction of a unit
// (1.5 tablets x TDS x 5 days = 22.5 -> 23).
const computeExpectedQty = (frequency?: string, duration?: string, dose?: string | number): number | null => {
  const doses = scheduledDoseCount(frequency, duration);
  const perDose = Number(dose);
  if (doses === null || !Number.isFinite(perDose) || perDose <= 0) return null;
  return Math.ceil(perDose * doses - 1e-9);
};

// Why the quantity is or isn't being calculated, in words the prescriber can act on. Silence was
// the original problem: the field just sat there saying "Manual" with no hint what was missing.
type QtyNote = { ok: true; text: string } | { ok: false; text: string };
const explainQty = (frequency: string, duration: string, dose: string, unit: string, qty: string): QtyNote => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  const perDose = Number(dose);
  const hasDose = Number.isFinite(perDose) && perDose > 0;

  if (!hasDose) return { ok: false, text: `Enter how many ${unit.toLowerCase()} per dose` };
  if (isStat) return { ok: true, text: `${perDose} ${unit.toLowerCase()} once (STAT) = ${qty}` };
  if (!frequency.trim()) return { ok: false, text: 'Add a frequency (e.g. TDS) to calculate' };
  if (perDay === null) return { ok: false, text: `Can't total \u201c${frequency.trim()}\u201d \u2014 enter the quantity` };
  if (!duration.trim()) return { ok: false, text: 'Add a duration (e.g. 5 days) to calculate' };
  if (days === null) return { ok: false, text: `Can't total \u201c${duration.trim()}\u201d \u2014 enter the quantity` };
  return { ok: true, text: `${perDose} \u00d7 ${perDay}/day \u00d7 ${days} day${days === 1 ? '' : 's'} = ${qty} ${unit.toLowerCase()}` };
};

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
  // Units taken per dose in the medicine's dispensing unit ("2" tablets, "5" ml). Kept as text so
  // the field can be empty until the doctor deliberately fills it in — see computeExpectedQty.
  dose_qty: string;
  qtyManual: boolean;
  frequency: string;
  duration: string;
  route: string;
  instructionChips: string[];
  qty: string;
}

// Fills in defaults for drafts saved before external purchase/instructions-chips support existed,
// and reconstructs instruction chips from a legacy plain-text `instructions` string if present.
const normalizeItem = (it: any): DraftItem => ({
  ...it,
  dose_qty: Number(it.dose_qty) > 0 ? String(it.dose_qty) : '1',
  qtyManual: it.qtyManual ?? false,
  instructionChips: it.instructionChips ?? (it.instructions ? String(it.instructions).split(';').map((s: string) => s.trim()).filter(Boolean) : []),
});

type StockBadge = { emoji: string; label: string; cls: string } | null;
const stockBadge = (item: DraftItem): StockBadge => {
  const qtyNum = Number(item.qty) || 0;
  if (item.totalQty === 0) return { emoji: '🔴', label: 'Not Available in Clinic', cls: 'red' };
  if (item.totalQty < qtyNum) return { emoji: '🟠', label: 'Insufficient Stock', cls: 'amber' };
  return null;
};

const draftKey = (consultationId: number) => scopedDraftKey(`doctor_rx_${consultationId}`);

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
  const location = useLocation();
  const { data: context, loading, error } = useApiData(() => getPrescriptionContext(consultationId), [consultationId]);
  const { data: clinicSettings } = useApiData(() => getClinicSettings(), []);

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
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);
  const [skipPrescription, setSkipPrescription] = useState(false);
  const [createdPrescriptionId, setCreatedPrescriptionId] = useState<number | null>(null);
  const [consultationFeeInput, setConsultationFeeInput] = useState(() => {
    const passedFee = (location.state as { consultationFee?: string } | null)?.consultationFee;
    return passedFee ?? '';
  });

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
      {
        key: `${m.medicine_id}-${Date.now()}`,
        medicine_id: m.medicine_id,
        name: m.name,
        generic_name: m.generic_name,
        strength: m.strength,
        form: m.form,
        category: m.category,
        unit: m.base_unit,
        totalQty: m.totalQty,
        stockStatus: m.stockStatus,
        dosage: m.strength || '',
        dose_qty: '1',
        qtyManual: false,
        frequency: '',
        duration: '',
        route: '',
        instructionChips: [],
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

  // Frequency/Duration changes ripple into Qty when it is calculable.
  const updateFreqOrDuration = (key: string, field: 'frequency' | 'duration') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, [field]: value };
        const expected = updated.qtyManual ? null : computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );
  };

  const updateDose = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, dose_qty: value };
        const expected = updated.qtyManual ? null : computeExpectedQty(updated.frequency, updated.duration, value);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );
  };

  const setQtyManual = (key: string, manual: boolean) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const updated = { ...it, qtyManual: manual };
        const expected = manual ? null : computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
        return { ...updated, qty: expected !== null ? String(expected) : updated.qty };
      })
    );

  const updateQtyManual = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, qty: value } : it)));
  };



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
      dose_qty: Number(i.dose_qty) > 0 ? Number(i.dose_qty) : undefined,
      qty_manual: i.qtyManual || scheduledDoseCount(i.frequency, i.duration) === null,
      external_qty: 0,
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

  const validatePrescriptionDraft = () => {
    if (items.length === 0) {
      setSubmitError('Add at least one medicine, or choose “No medicines needed”.');
      return false;
    }
    if (allergyConflictItems.length > 0 && !allergyAck) {
      setSubmitError('Acknowledge the allergy alert below before finalizing.');
      return false;
    }
    const missingDose = items.find((i) => scheduledDoseCount(i.frequency, i.duration) !== null && !i.qtyManual && !(Number(i.dose_qty) > 0));
    if (missingDose) {
      setSubmitError(`Enter how many ${missingDose.unit} of ${missingDose.name} are taken per dose (or choose \u201cEnter quantity manually\u201d).`);
      return false;
    }
    setSubmitError(null);
    return true;
  };

  const openFinalReview = (withoutPrescription = false) => {
    if (!withoutPrescription && !validatePrescriptionDraft()) return;
    setSkipPrescription(withoutPrescription);
    setSubmitError(null);
    setFinalReviewOpen(true);
  };

  const finalizeVisit = async () => {
    if (submittingRef.current) return;
    const fee = consultationFeeInput.trim() === '' ? undefined : Number(consultationFeeInput);
    if (fee !== undefined && (Number.isNaN(fee) || fee < 0)) {
      setSubmitError('Consultation fee must be a positive number.');
      return;
    }
    submittingRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!skipPrescription) {
        let prescriptionId = createdPrescriptionId;
        if (!prescriptionId) {
          const res = await createPrescription({
            consultation_id: consultationId,
            items: buildItemsInput(),
            allergyAck,
            notes: notes || undefined,
          });
          prescriptionId = res.data.prescription_id;
          setCreatedPrescriptionId(prescriptionId);
        }

        if (externalItems.length > 0) {
          await bulkCreateExternalMedicines(prescriptionId, externalItems.map(draftToInput));
          setExternalItems([]);
        }
      }

      await finalizeConsultation(consultationId, fee);
      localStorage.removeItem(draftKey(consultationId));
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 409 && err.response.data?.conflicts) {
        setSubmitError(`Allergy conflict: ${err.response.data.conflicts.join(', ')} — acknowledge it and finalize again.`);
      } else {
        setSubmitError(err.response?.data?.message || 'Could not finalize the visit. Nothing will be submitted twice; please try again.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const patient = displayPrescriptionPatient(context);
  const visitType = context.patientSummary.priorVisitCount > 0 ? 'Return Visit' : 'New Visit';

  const stockIssues = items.filter((i) => i.totalQty > 0 && i.totalQty < Number(i.qty));
  const outOfStock = items.filter((i) => i.totalQty === 0);

  return (
    <div>
      <div className="cons-flow-strip" aria-label="Consultation workflow">
        <button className="done" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
          <span><CheckCircleIcon /></span><strong>Examine &amp; document</strong><small>Clinical assessment saved</small>
        </button>
        <button className="active">
          <span>2</span><strong>Prescribe &amp; finalize</strong><small>Add medicines, then complete the visit</small>
        </button>
      </div>
      <div className="dash-header">
        <div>
          <span className="cons-step-kicker">STEP 2 OF 2</span>
          <h1>Prescribe medicines</h1>
          <p>Prepare the treatment as a draft. It is sent to pharmacy only when you finalize the visit.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            ← Back to examination
          </button>
          <button className="pat-btn" onClick={handleSaveDraft}>
            <SaveIcon /> Save as Draft
          </button>
          <button className="pat-btn" onClick={() => openFinalReview(true)}>
            No medicines needed
          </button>
          <button className="pat-btn primary" onClick={() => openFinalReview(false)} disabled={submitting}>
            <CheckCircleIcon /> Review &amp; finalize
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

        <div className={`rxp-allergy-strip${context.patientSummary.allergies ? ' has-allergies' : ''}`}>
          {context.patientSummary.allergies ? <AlertIcon /> : <CheckCircleIcon />}
          <span>
            <strong>{context.patientSummary.allergies ? 'Allergies' : 'No known allergies'}</strong>
            {context.patientSummary.allergies ? `: ${context.patientSummary.allergies}` : ' recorded for this patient.'}
          </span>
          <button className="card-link" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            View full record →
          </button>
        </div>
      </div>

      <div className="cons-layout rxp-no-rail">
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
                  const scheduleCalculable = scheduledDoseCount(it.frequency, it.duration) !== null;
                  const expectedQty = it.qtyManual ? null : computeExpectedQty(it.frequency, it.duration, it.dose_qty);
                  const needsDose = scheduleCalculable && !it.qtyManual && !(Number(it.dose_qty) > 0);
                  const qtyNote = explainQty(it.frequency, it.duration, it.dose_qty, it.unit, it.qty);
                  const badge = stockBadge(it);
                  return (
                    <tr key={it.key}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="rxb-med-name">{it.name}</div>
                        <div className="rxb-med-generic">{[it.form, it.category].filter(Boolean).join(' · ') || it.generic_name}</div>
                        <div className="rxp-source-block">
                          <div className="rxp-source-meta">
                            Clinic Stock: <strong>{it.totalQty}</strong> · Required Qty: <strong>{qtyNum}</strong>
                          </div>
                          {badge && (
                            <span className={`rxp-source-badge ${badge.cls}`}>
                              {badge.emoji} {badge.label}
                            </span>
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
                                  dose_qty: it.dose_qty,
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
                        <input className="rxb-table-input" value={it.dosage} onChange={updateItem(it.key, 'dosage')} placeholder="500 mg" aria-label="Strength / dosage" />
                        <label className="rxp-dose-row" title="How many units the patient takes each time — the quantity is calculated from this">
                          Take
                          <input
                            className="rxb-table-input"
                            style={{ width: 64, ...(needsDose ? { borderColor: '#dc2626' } : {}) }}
                            type="text"
                            inputMode="decimal"
                            value={it.dose_qty}
                            onChange={updateDose(it.key)}
                            aria-label={`${it.unit} per dose`}
                          />
                          {it.unit} / dose
                        </label>
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
                          <>
                            <input className="rxb-table-input qty" type="number" value={it.qty} disabled />
                            {/* Show the arithmetic, so a wrong frequency or duration is caught here
                                rather than at the counter. */}
                            <div className="rxp-qty-note calculated">{qtyNote.text}</div>
                            <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, true)}>
                              Enter quantity manually
                            </button>
                          </>
                        ) : needsDose ? (
                          <>
                            <input className="rxb-table-input qty" type="number" value="" disabled placeholder="—" />
                            <div className="rxp-qty-note blocked">{qtyNote.text}</div>
                            <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, true)}>
                              Enter quantity manually
                            </button>
                          </>
                        ) : (
                          <>
                            <input className="rxb-table-input qty" type="number" min={1} value={it.qty} onChange={updateQtyManual(it.key)} />
                            <div className={`rxp-qty-note ${it.qtyManual ? 'manual' : 'blocked'}`}>
                              {it.qtyManual ? `Manual (${it.unit.toLowerCase()})` : qtyNote.text}
                            </div>
                            {it.qtyManual && scheduleCalculable && (
                              <button type="button" className="rxp-qty-link" onClick={() => setQtyManual(it.key, false)}>
                                Calculate from dose
                              </button>
                            )}
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
            patient={{ fullName: patient.fullName, patientId: patient.patientId, dob: patient.dob }}
            doctor={context.appointment.doctor}
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
              <button className="cons-btn primary" onClick={() => openFinalReview(false)} disabled={submitting}>
                <CheckCircleIcon /> Review &amp; finalize
              </button>
            </div>
          </div>
        </div>
      </div>

      {finalReviewOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => !submitting && event.target === event.currentTarget && setFinalReviewOpen(false)}>
          <div className="modal-card cons-complete-modal" role="dialog" aria-modal="true" aria-labelledby="rx-finalize-title">
            <div className="cons-complete-heading">
              <div>
                <span className="cons-safety-kicker">FINAL CHECK</span>
                <h2 id="rx-finalize-title">Finalize visit &amp; call next</h2>
                <p>The prescription remains a draft until you confirm this action.</p>
              </div>
            </div>

            <div className="cons-complete-patient">
              <strong>{patient.fullName}</strong>
              <span>{context.consultation.diagnosis || 'No diagnosis recorded'}</span>
            </div>

            <div className="cons-complete-checks">
              <div className="done">
                <CheckCircleIcon />
                <span><strong>Clinical documentation</strong><small>Saved in the consultation draft</small></span>
              </div>
              <div className={skipPrescription ? 'optional' : 'done'}>
                <ClipboardIcon />
                <span>
                  <strong>Prescription</strong>
                  <small>{skipPrescription ? 'No medicines required' : `${items.length} medicine${items.length === 1 ? '' : 's'} ready to submit`}</small>
                </span>
              </div>
              <div className={allergyConflictItems.length > 0 && !allergyAck && !skipPrescription ? 'required' : 'done'}>
                <AlertIcon />
                <span>
                  <strong>Allergy safety</strong>
                  <small>{allergyConflictItems.length > 0 ? 'Potential conflict acknowledged' : context.patientSummary.allergies || 'No known allergies recorded'}</small>
                </span>
              </div>
            </div>

            {!skipPrescription && (
              <div className="rxb-banner warning" style={{ marginTop: 12 }}>
                <AlertIcon /> Clicking “Finalize &amp; call next” will submit this prescription to the pharmacy. It is not submitted before then.
              </div>
            )}

            {submitError && <div className="cons-complete-warning"><AlertIcon /> {submitError}</div>}

            <div className="cons-complete-fee">
              <label htmlFor="rx-finalize-fee">Consultation fee (LKR)</label>
              <input
                id="rx-finalize-fee"
                className="cons-input"
                type="number"
                min={0}
                step="0.01"
                value={consultationFeeInput}
                onChange={(event) => setConsultationFeeInput(event.target.value)}
                placeholder={clinicSettings ? String(clinicSettings.default_consultation_fee) : 'Clinic default'}
              />
              <small>Leave empty to use the clinic default.</small>
            </div>

            <div className="modal-actions">
              <button className="cons-btn" disabled={submitting} onClick={() => setFinalReviewOpen(false)}>Continue editing</button>
              <button className="cons-btn primary" disabled={submitting} onClick={finalizeVisit}>
                <CheckCircleIcon /> {submitting ? 'Finalizing…' : 'Finalize & call next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewPrescription;
