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

// Mirrors backend/src/modules/prescriptions/qtyCalc.ts — same "instant UI calc, server is
// authoritative" duplication convention already used by NewPrescription.tsx's own copy. Kept
// permissive here (never blocks submit) since the External Medicine spec explicitly allows a
// manual qty whenever auto-calc isn't reliable.
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

export interface ExternalMedicineDraft {
  key: string;
  medicine_id?: number;
  medicine_name: string;
  generic_name: string;
  brand_name: string;
  dosage_form: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
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
  frequency: '',
  duration: '',
  quantity: '1',
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
      <tr><th>#</th><th>Medicine</th><th>Form</th><th>Strength</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Qty</th><th>Instructions</th></tr>
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
        frequency: prefill.frequency || '',
        duration: prefill.duration || '',
        quantity: String(prefill.quantity),
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
      frequency: '',
      duration: '',
      quantity: '1',
      quantity_unit: m.base_unit,
      instructionChips: [],
    });
    setStep('details');
  };

  const startManual = () => {
    setDraft(emptyDraft(`ext-${Date.now()}`));
    setStep('manual');
  };

  const updateFreqOrDuration = (field: 'frequency' | 'duration', value: string) => {
    setDraft((prev) => {
      const updated = { ...prev, [field]: value };
      const expected = computeExpectedQty(updated.frequency, updated.duration);
      return expected !== null ? { ...updated, quantity: String(expected) } : updated;
    });
  };

  const expectedQty = computeExpectedQty(draft.frequency, draft.duration);
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
                <input value={draft.dosage} onChange={(e) => setDraft({ ...draft, dosage: e.target.value })} placeholder="e.g. 1 tablet" />
              </div>
              <div className="modal-field">
                <label>Frequency</label>
                <input list="ext-frequency-options" value={draft.frequency} onChange={(e) => updateFreqOrDuration('frequency', e.target.value)} placeholder="TDS" />
              </div>
            </div>

            <div className="ext-form-row">
              <div className="modal-field">
                <label>Duration</label>
                <input list="ext-duration-options" value={draft.duration} onChange={(e) => updateFreqOrDuration('duration', e.target.value)} placeholder="6 Days" />
              </div>
              <div className="modal-field">
                <label>
                  Quantity {expectedQty !== null ? <span className="ext-qty-tag auto">Auto Calculated</span> : <span className="ext-qty-tag manual">Manual</span>}
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
