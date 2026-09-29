import { useEffect, useRef, useState } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import type { ExternalMedicineInput } from '../../lib/externalMedicines';
import { listMasterData, getClinicSettings } from '../../lib/settings';
import type { ClinicSettings } from '../../lib/settings';
import { fileUrl } from '../../lib/api';
import { calculateAge } from '../../lib/queue';
import InstructionsPicker from '../../components/InstructionsPicker';
import { PlusIcon, SearchIcon, EditIcon, TrashIcon, ClockIcon, XIcon, PillIcon, PrintIcon } from '../../components/layout/Icons';
import './externalMedicines.css';

const FREQUENCY_OPTIONS = ['OD - Once Daily', 'BD - Twice Daily', 'TDS - Three times daily', 'QID - Four times daily', 'PRN - As needed', 'STAT', 'HS - At bedtime'];
const DURATION_OPTIONS = ['3 Days', '5 Days', '7 Days', '10 Days', '14 Days', '1 Month', 'Ongoing'];

// Mirrors backend/src/modules/prescriptions/qtyCalc.ts, same copy as NewPrescription.tsx uses.
// External items are never validated server-side (they are bought outside the clinic), so this
// copy only has to agree with the prescriber's expectation — but it is kept byte-identical to the
// backend block anyway so all three read the same shorthand.
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

// Whole units to dispense, rounded UP (1.5 tablets x TDS x 5 days = 22.5 -> 23).
const computeExpectedQty = (frequency?: string, duration?: string, dose?: string | number): number | null => {
  const doses = scheduledDoseCount(frequency, duration);
  const perDose = Number(dose);
  if (doses === null || !Number.isFinite(perDose) || perDose <= 0) return null;
  return Math.ceil(perDose * doses - 1e-9);
};

// Why the quantity is or isn't being calculated — mirrors the clinic prescription table so the
// two halves of the same prescription behave the same way.
const explainQty = (frequency: string, duration: string, dose: string, unit: string, qty: string): { ok: boolean; text: string } => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  const perDose = Number(dose);
  const label = (unit || 'units').toLowerCase();
  if (!(Number.isFinite(perDose) && perDose > 0)) return { ok: false, text: `Enter how many ${label} per dose` };
  if (isStat) return { ok: true, text: `${perDose} ${label} once (STAT) = ${qty}` };
  if (!frequency.trim()) return { ok: false, text: 'Add a frequency (e.g. TDS) to calculate' };
  if (perDay === null) return { ok: false, text: `Can't total \u201c${frequency.trim()}\u201d \u2014 enter the quantity` };
  if (!duration.trim()) return { ok: false, text: 'Add a duration (e.g. 5 days) to calculate' };
  if (days === null) return { ok: false, text: `Can't total \u201c${duration.trim()}\u201d \u2014 enter the quantity` };
  return { ok: true, text: `${perDose} \u00d7 ${perDay}/day \u00d7 ${days} day${days === 1 ? '' : 's'} = ${qty} ${label}` };
};

export interface ExternalMedicineDraft {
  key: string;
  medicine_id?: number;
  medicine_name: string;
  generic_name: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  dosage: string;
  // Units taken per administration ("1", "1.5"). Text so the field can be empty until filled in.
  dose_qty: string;
  frequency: string;
  duration: string;
  quantity: string;
  // True when the quantity is deliberately not the full course — a shortfall prefill only covers
  // what the clinic cannot supply, so the schedule must not overwrite it.
  qtyManual: boolean;
  quantity_unit: string;
  instructionChips: string[];
}

// Passed down when the doctor clicks "Add to External Medicines" on a clinic item that's
// out-of-stock/short — pre-fills the Add flow so the doctor never re-types what's already known.
export interface ShortfallPrefill {
  medicine_id?: number;
  medicine_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  dosage?: string;
  /** Units per dose already entered on the clinic line, so Take does not have to be retyped. */
  dose_qty?: string;
  frequency?: string;
  duration?: string;
  quantity: number;
  quantity_unit: string;
}

export const draftToInput = (d: ExternalMedicineDraft): ExternalMedicineInput => ({
  medicine_id: d.medicine_id,
  medicine_name: d.medicine_name,
  generic_name: d.generic_name || undefined,
  brand_name: d.brand_name || undefined,
  dosage_form: d.dosage_form,
  strength: d.strength || undefined,
  dosage: d.dosage,
  dose_qty: Number(d.dose_qty) > 0 ? Number(d.dose_qty) : undefined,
  frequency: d.frequency || undefined,
  duration: d.duration || undefined,
  quantity: Number(d.quantity) || 1,
  quantity_unit: d.quantity_unit,
  instructions: d.instructionChips.length ? d.instructionChips.join('; ') : undefined,
});

const emptyDraft = (key: string): ExternalMedicineDraft => ({
  key,
  medicine_name: '',
  generic_name: '',
  brand_name: '',
  dosage_form: '',
  strength: '',
  dosage: '',
  dose_qty: '1',
  frequency: '',
  duration: '',
  quantity: '1',
  qtyManual: false,
  quantity_unit: '',
  instructionChips: [],
});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// Built client-side (rather than fetched from the backend PDF endpoint used post-submit) because
// these are still unsaved drafts — there's no prescription_id to ask the server for yet. Opened in
// a fresh window and printed via the browser's own print dialog, same "let the browser render the
// PDF/print surface" convention as downloadExternalPurchaseSlip/previewExternalMedicineSlip.
const buildExternalSlipHtml = (opts: {
  clinic: ClinicSettings | null;
  patient: { fullName: string; patientId: string | null; dob: string | null };
  doctor: { username: string; registration_number: string | null };
  items: ExternalMedicineDraft[];
}) => {
  const { clinic, patient, doctor, items } = opts;
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const age = patient.dob ? calculateAge(patient.dob) : null;

  // When the clinic has uploaded its own header/letterhead image (Settings > General), that IS
  // the header — it already carries the clinic name, doctor and registration details the way a
  // physical prescription pad prints them. Only fall back to typed clinic details otherwise.
  const headerHtml = clinic?.logo_url
    ? `<img src="${escapeHtml(fileUrl(clinic.logo_url))}" class="ext-slip-logo" />`
    : `<div class="ext-slip-clinic-name">${escapeHtml(clinic?.clinic_name || 'MediCare Clinic & Dispensary')}</div>
       ${clinic?.clinic_address ? `<div class="ext-slip-clinic-line">${escapeHtml(clinic.clinic_address)}</div>` : ''}
       ${clinic?.registration_number ? `<div class="ext-slip-clinic-line">Reg No: ${escapeHtml(clinic.registration_number)}</div>` : ''}`;

  const rows = items
    .map((it, i) => {
      const generic = [it.generic_name, it.brand_name].filter(Boolean).join(' · ');
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(it.medicine_name)}</strong>${generic ? `<br/><span class="muted">${escapeHtml(generic)}</span>` : ''}</td>
        <td>${escapeHtml(it.dosage_form || '—')}</td>
        <td>${escapeHtml(it.strength || '—')}</td>
        <td>${escapeHtml(it.dosage || '—')}</td>
        <td>${escapeHtml(Number(it.dose_qty) > 0 ? `${it.dose_qty} ${it.quantity_unit}` : '—')}</td>
        <td>${escapeHtml(it.frequency || '—')}</td>
        <td>${escapeHtml(it.duration || '—')}</td>
        <td>${escapeHtml(`${it.quantity} ${it.quantity_unit}`)}</td>
        <td>${escapeHtml(it.instructionChips.join(', ') || '—')}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>External Medicine Slip</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 24px; }
  .ext-slip-header { text-align: center; margin-bottom: 12px; }
  .ext-slip-logo { max-width: 100%; max-height: 130px; object-fit: contain; }
  .ext-slip-clinic-name { font-size: 19px; font-weight: bold; }
  .ext-slip-clinic-line { font-size: 12px; color: #444; }
  .ext-slip-rule { border-top: 1px solid #999; margin: 10px 0 14px; }
  .ext-slip-meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; font-family: Arial, sans-serif; }
  .ext-slip-title { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 8px; font-family: Arial, sans-serif; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: Arial, sans-serif; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; }
  .muted { color: #666; font-size: 11px; }
  .ext-slip-note { font-size: 11px; color: #555; font-style: italic; margin-top: 10px; font-family: Arial, sans-serif; }
  .ext-slip-signoff { margin-top: 40px; font-size: 13px; font-family: Arial, sans-serif; }
  .ext-slip-sign-line { margin-top: 34px; border-top: 1px solid #333; width: 260px; padding-top: 4px; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
  <div class="ext-slip-header">${headerHtml}</div>
  <div class="ext-slip-rule"></div>
  <div class="ext-slip-meta">
    <span>Patient: <strong>${escapeHtml(patient.fullName)}</strong></span>
    <span>Age: <strong>${age !== null ? age : '_______'}</strong></span>
    <span>Date: <strong>${today}</strong></span>
  </div>
  <div class="ext-slip-title">External Medicines</div>
  <table>
    <thead>
      <tr><th>#</th><th>Medicine</th><th>Form</th><th>Strength</th><th>Dosage</th><th>Take</th><th>Frequency</th><th>Duration</th><th>Qty</th><th>Instructions</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="ext-slip-note">
    The above medicines are to be purchased from an external pharmacy or other authorized source and are not being dispensed by the clinic pharmacy.
  </div>
  <div class="ext-slip-signoff">
    <div>Doctor: Dr. ${escapeHtml(doctor.username)}</div>
    ${doctor.registration_number ? `<div>Registration No: ${escapeHtml(doctor.registration_number)}</div>` : ''}
    <div class="ext-slip-sign-line">Signature</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
};

type Step = 'search' | 'manual' | 'details';

const AddExternalMedicineModal = ({
  dosageForms,
  editing,
  prefill,
  onClose,
  onSave,
}: {
  dosageForms: string[];
  editing: ExternalMedicineDraft | null;
  prefill: ShortfallPrefill | null;
  onClose: () => void;
  onSave: (draft: ExternalMedicineDraft) => void;
}) => {
  const [step, setStep] = useState<Step>(editing || prefill ? 'details' : 'search');
  const [draft, setDraft] = useState<ExternalMedicineDraft>(() => {
    if (editing) return editing;
    if (prefill) {
      return {
        key: `ext-${Date.now()}`,
        medicine_id: prefill.medicine_id,
        medicine_name: prefill.medicine_name,
        generic_name: prefill.generic_name || '',
        brand_name: prefill.brand_name || '',
        dosage_form: prefill.dosage_form || '',
        strength: prefill.strength || '',
        dosage: prefill.dosage || prefill.strength || '',
        dose_qty: prefill.dose_qty || '1',
        frequency: prefill.frequency || '',
        duration: prefill.duration || '',
        quantity: String(prefill.quantity),
        qtyManual: true,
        quantity_unit: prefill.quantity_unit,
        instructionChips: [],
      };
    }
    return emptyDraft(`ext-${Date.now()}`);
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [catalogResults, setCatalogResults] = useState<Medicine[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setCatalogResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchMedicines(searchTerm)
        .then(setCatalogResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const pickCatalog = (m: Medicine) => {
    setDraft({
      key: `ext-${Date.now()}`,
      medicine_id: m.medicine_id,
      medicine_name: m.name,
      generic_name: m.generic_name || '',
      brand_name: m.brand_name || '',
      dosage_form: m.form || '',
      strength: m.strength || '',
      dosage: m.strength || `1 ${m.base_unit}`,
      dose_qty: '1',
      frequency: '',
      duration: '',
      quantity: '1',
      qtyManual: false,
      quantity_unit: m.base_unit,
      instructionChips: [],
    });
    setStep('details');
  };

  const startManual = () => {
    setDraft(emptyDraft(`ext-${Date.now()}`));
    setStep('manual');
  };

  // Dose, frequency and duration all feed the quantity, so any of them recomputes it.
  const updateSchedule = (field: 'frequency' | 'duration' | 'dose_qty', value: string) => {
    setDraft((prev) => {
      const updated = { ...prev, [field]: value };
      if (updated.qtyManual) return updated;
      const expected = computeExpectedQty(updated.frequency, updated.duration, updated.dose_qty);
      return expected !== null ? { ...updated, quantity: String(expected) } : updated;
    });
  };

  const calculatedQty = computeExpectedQty(draft.frequency, draft.duration, draft.dose_qty);
  const expectedQty = draft.qtyManual ? null : calculatedQty;
  const setQtyManual = (manual: boolean) =>
    setDraft((prev) => {
      if (manual) return { ...prev, qtyManual: true };
      const expected = computeExpectedQty(prev.frequency, prev.duration, prev.dose_qty);
      return { ...prev, qtyManual: false, quantity: expected !== null ? String(expected) : prev.quantity };
    });
  const qtyNote = explainQty(draft.frequency, draft.duration, draft.dose_qty, draft.quantity_unit, draft.quantity);
  const canSave = draft.medicine_name.trim() && draft.dosage_form.trim() && draft.dosage.trim() && draft.quantity_unit.trim() && (Number(draft.quantity) || 0) > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card ext-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editing ? 'Edit External Medicine' : 'Add External Medicine'}</span>
          <button className="pat-icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        {step === 'search' && (
          <>
            <div className="ext-search-box">
              <SearchIcon />
              <input autoFocus placeholder="Search medicine or item…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button type="button" className="ext-manual-link" onClick={startManual}>
              <PlusIcon /> Add New External Item
            </button>

            {searchTerm.trim().length >= 2 && (
              <div className="ext-results">
                {searching && <div className="ext-results-empty">Searching…</div>}
                {!searching && catalogResults.length > 0 && (
                  <>
                    <div className="ext-results-heading">From Medicine Catalog</div>
                    {catalogResults.map((m) => (
                      <div className="ext-result-card" key={m.medicine_id} onClick={() => pickCatalog(m)}>
                        <div className="ext-result-title">
                          {m.name} {m.strength ? `(${m.strength})` : ''}
                        </div>
                        <div className="ext-result-meta">
                          Generic: {m.generic_name || '—'} · Form: {m.form || '—'}
                        </div>
                        <div className="ext-result-meta">
                          Clinic Stock: <strong className={m.totalQty === 0 ? 'zero' : ''}>{m.totalQty}</strong>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {!searching && catalogResults.length === 0 && (
                  <div className="ext-results-empty">No matches — try "+ Add New External Item" to enter it manually.</div>
                )}
              </div>
            )}
          </>
        )}

        {step === 'manual' && (
          <div className="ext-form">
            <div className="modal-field">
              <label>Medicine / Item Name *</label>
              <input value={draft.medicine_name} onChange={(e) => setDraft({ ...draft, medicine_name: e.target.value })} placeholder="e.g. Special Skin Cream" autoFocus />
            </div>
            <div className="ext-form-row">
              <div className="modal-field">
                <label>Generic Name</label>
                <input value={draft.generic_name} onChange={(e) => setDraft({ ...draft, generic_name: e.target.value })} />
              </div>
              <div className="modal-field">
                <label>Brand Name</label>
                <input value={draft.brand_name} onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })} />
              </div>
            </div>
            <div className="ext-form-row">
              <div className="modal-field">
                <label>Dosage Form</label>
                <select value={draft.dosage_form} onChange={(e) => setDraft({ ...draft, dosage_form: e.target.value })}>
                  <option value="">Select…</option>
                  {dosageForms.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Strength</label>
                <input value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} placeholder="e.g. 1%" />
              </div>
            </div>
            <div className="modal-field">
              <label>Unit</label>
              <input value={draft.quantity_unit} onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })} placeholder="e.g. Tube" />
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setStep('search')}>
                Back
              </button>
              <button className="modal-btn primary" disabled={!draft.medicine_name.trim()} onClick={() => setStep('details')}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="ext-form">
            <div className="ext-selected-item">
              <PillIcon />
              <div>
                <div className="ext-selected-name">{draft.medicine_name}</div>
                <div className="ext-selected-meta">{[draft.generic_name, draft.brand_name].filter(Boolean).join(' · ') || 'Manual entry'}</div>
              </div>
              {!editing && (
                <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '5px 9px', marginLeft: 'auto' }} onClick={() => setStep('search')}>
                  Change
                </button>
              )}
            </div>

            <div className="ext-form-row">
              <div className="modal-field">
                <label>Dosage Form</label>
                <select value={draft.dosage_form} onChange={(e) => setDraft({ ...draft, dosage_form: e.target.value })}>
                  <option value="">Select…</option>
                  {dosageForms.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Strength</label>
                <input value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: e.target.value })} placeholder="e.g. 500mg" />
              </div>
            </div>

            <div className="ext-form-row">
              <div className="modal-field">
                <label>Dosage</label>
                <input value={draft.dosage} onChange={(e) => setDraft({ ...draft, dosage: e.target.value })} placeholder="e.g. 250 mg" />
              </div>
              <div className="modal-field">
                <label>Take (per dose)</label>
                <div className="ext-take-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.dose_qty}
                    onChange={(e) => updateSchedule('dose_qty', e.target.value)}
                    placeholder="1"
                    aria-label={`${draft.quantity_unit || 'units'} per dose`}
                  />
                  <span>{(draft.quantity_unit || 'units').toLowerCase()} / dose</span>
                </div>
              </div>
              <div className="modal-field">
                <label>Frequency</label>
                <input list="ext-frequency-options" value={draft.frequency} onChange={(e) => updateSchedule('frequency', e.target.value)} placeholder="TDS" />
              </div>
            </div>

            <div className="ext-form-row">
              <div className="modal-field">
                <label>Duration</label>
                <input list="ext-duration-options" value={draft.duration} onChange={(e) => updateSchedule('duration', e.target.value)} placeholder="6 Days" />
              </div>
              <div className="modal-field">
                <label>
                  Quantity {expectedQty !== null ? <span className="ext-qty-tag auto">Auto calculated</span> : <span className="ext-qty-tag manual">Manual</span>}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    value={draft.quantity}
                    disabled={expectedQty !== null}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                  <input
                    style={{ maxWidth: 110 }}
                    value={draft.quantity_unit}
                    onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })}
                    placeholder="tablets"
                  />
                </div>
                {draft.qtyManual ? (
                  <div className="ext-qty-note">
                    Entered by hand{calculatedQty !== null && ` \u2014 a full course would be ${calculatedQty}`}.{' '}
                    <button type="button" className="ext-qty-link" onClick={() => setQtyManual(false)}>
                      Calculate from dose
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={`ext-qty-note ${qtyNote.ok ? 'calculated' : 'blocked'}`}>{qtyNote.text}</div>
                    {qtyNote.ok && (
                      <button type="button" className="ext-qty-link" onClick={() => setQtyManual(true)}>
                        Enter quantity manually
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="modal-field">
              <label>Instructions</label>
              <InstructionsPicker chips={draft.instructionChips} onChange={(chips) => setDraft({ ...draft, instructionChips: chips })} />
            </div>

            <datalist id="ext-frequency-options">
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <datalist id="ext-duration-options">
              {DURATION_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="modal-btn primary" disabled={!canSave} onClick={() => onSave(draft)}>
                {editing ? 'Save Changes' : 'Add External Medicine'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ExternalMedicineSection = ({
  items,
  onChange,
  prefillRequest,
  onPrefillConsumed,
  patient,
  doctor,
}: {
  items: ExternalMedicineDraft[];
  onChange: (items: ExternalMedicineDraft[]) => void;
  prefillRequest: ShortfallPrefill | null;
  onPrefillConsumed: () => void;
  patient: { fullName: string; patientId: string | null; dob: string | null };
  doctor: { username: string; registration_number: string | null };
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    listMasterData('DosageForm').then((rows) => setDosageForms(rows.map((r) => r.value)));
    getClinicSettings().then(setClinicSettings).catch(() => {});
  }, []);

  const printSlip = () => {
    const html = buildExternalSlipHtml({ clinic: clinicSettings, patient, doctor, items });
    const win = window.open('', '_blank', 'width=850,height=920');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  useEffect(() => {
    if (prefillRequest && !consumedRef.current) {
      consumedRef.current = true;
      setEditingKey(null);
      setModalOpen(true);
    }
    if (!prefillRequest) consumedRef.current = false;
  }, [prefillRequest]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingKey(null);
    if (prefillRequest) onPrefillConsumed();
  };

  const handleSave = (draft: ExternalMedicineDraft) => {
    if (editingKey) {
      onChange(items.map((i) => (i.key === editingKey ? draft : i)));
    } else {
      onChange([...items, draft]);
    }
    closeModal();
  };

  const editing = editingKey ? items.find((i) => i.key === editingKey) ?? null : null;

  return (
    <div className="cons-box" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="cons-box-title" style={{ margin: 0 }}>
          External Medicines
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="pat-btn"
            style={{ fontSize: 12.5, padding: '7px 12px' }}
            disabled={items.length === 0}
            onClick={printSlip}
            title={items.length === 0 ? 'Add an external medicine first' : 'Print the external medicine slip for the doctor to sign'}
          >
            <PrintIcon /> Print
          </button>
          <button type="button" className="pat-btn primary" style={{ fontSize: 12.5, padding: '7px 12px' }} onClick={() => setModalOpen(true)}>
            <PlusIcon /> Add External Medicine
          </button>
        </div>
      </div>

      <table className="rxb-table">
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Form</th>
            <th>Strength</th>
            <th>Dosage</th>
            <th>Take</th>
            <th>Frequency</th>
            <th>Duration</th>
            <th>Qty</th>
            <th>Instructions</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={9}>
                <div className="rxb-empty-table">No external medicines added. These are purchased outside the clinic and are separate from the pharmacy dispensing queue.</div>
              </td>
            </tr>
          )}
          {items.map((it) => (
            <tr key={it.key}>
              <td>
                <div className="rxb-med-name">{it.medicine_name}</div>
                <div className="rxb-med-generic">{[it.generic_name, it.brand_name].filter(Boolean).join(' · ') || '—'}</div>
              </td>
              <td>{it.dosage_form || '—'}</td>
              <td>{it.strength || '—'}</td>
              <td>{it.dosage}</td>
              <td>{Number(it.dose_qty) > 0 ? `${it.dose_qty} ${it.quantity_unit}` : '—'}</td>
              <td>{it.frequency || '—'}</td>
              <td>{it.duration || '—'}</td>
              <td>
                {it.quantity} {it.quantity_unit}
              </td>
              <td>{it.instructionChips.join(', ') || '—'}</td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="pat-icon-btn" aria-label="Edit" onClick={() => (setEditingKey(it.key), setModalOpen(true))}>
                    <EditIcon />
                  </button>
                  <button className="pat-icon-btn" aria-label="Remove" onClick={() => onChange(items.filter((x) => x.key !== it.key))}>
                    <TrashIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length > 0 && (
        <div className="ext-note">
          <ClockIcon /> Recorded against the patient's history and printed on the External Medicine Slip — not sent to the clinic pharmacy dispensing queue.
        </div>
      )}

      {modalOpen && (
        <AddExternalMedicineModal
          dosageForms={dosageForms}
          editing={editing}
          prefill={editing ? null : prefillRequest}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

export default ExternalMedicineSection;
