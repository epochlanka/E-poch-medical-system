import { useEffect, useRef, useState } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import type { ExternalMedicineInput } from '../../lib/externalMedicines';
import { listMasterData } from '../../lib/settings';
import InstructionsPicker from '../../components/InstructionsPicker';
import { PlusIcon, SearchIcon, EditIcon, TrashIcon, ClockIcon, XIcon, PillIcon } from '../../components/layout/Icons';
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
      dosage: m.strength || `1 ${m.unit}`,
      frequency: '',
      duration: '',
      quantity: '1',
      quantity_unit: m.unit,
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
}: {
  items: ExternalMedicineDraft[];
  onChange: (items: ExternalMedicineDraft[]) => void;
  prefillRequest: ShortfallPrefill | null;
  onPrefillConsumed: () => void;
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const consumedRef = useRef(false);

  useEffect(() => {
    listMasterData('DosageForm').then((rows) => setDosageForms(rows.map((r) => r.value)));
  }, []);

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
        <button type="button" className="pat-btn primary" style={{ fontSize: 12.5, padding: '7px 12px' }} onClick={() => setModalOpen(true)}>
          <PlusIcon /> Add External Medicine
        </button>
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
