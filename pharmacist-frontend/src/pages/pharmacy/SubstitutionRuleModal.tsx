import { useEffect, useState } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { MedicineSearchResult } from '../../lib/medicines';
import { createSubstitution } from '../../lib/pharmacy';
import type { SubstitutionType } from '../../lib/pharmacy';
import { XIcon, SaveIcon } from '../../components/layout/Icons';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const MedicinePicker = ({
  label,
  value,
  onChange,
  exclude,
}: {
  label: string;
  value: MedicineSearchResult | null;
  onChange: (m: MedicineSearchResult | null) => void;
  exclude?: number;
}) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<MedicineSearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (term.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchMedicines(term.trim()).then((r) => setResults(r.filter((m) => m.medicine_id !== exclude)));
    }, 250);
    return () => clearTimeout(t);
  }, [term, exclude]);

  return (
    <div className="modal-field" style={{ position: 'relative' }}>
      <label>{label}</label>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ fontSize: 13.5 }}>
            {value.name} {value.strength ? `(${value.strength})` : ''}
          </span>
          <button type="button" className="pat-icon-btn" style={{ width: 22, height: 22 }} onClick={() => onChange(null)}>
            <XIcon />
          </button>
        </div>
      ) : (
        <input placeholder="Search medicine…" value={term} onChange={(e) => setTerm(e.target.value)} onFocus={() => setOpen(true)} />
      )}
      {open && !value && results.length > 0 && (
        <div className="pat-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, width: 'auto', maxHeight: 220, overflowY: 'auto' }}>
          {results.map((m) => (
            <button
              type="button"
              key={m.medicine_id}
              onClick={() => {
                onChange(m);
                setTerm('');
                setOpen(false);
              }}
            >
              {m.name} {m.strength ? `(${m.strength})` : ''} {m.category ? `— ${m.category}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SubstitutionRuleModal = ({ onClose, onSaved }: Props) => {
  const [from, setFrom] = useState<MedicineSearchResult | null>(null);
  const [to, setTo] = useState<MedicineSearchResult | null>(null);
  const [priority, setPriority] = useState(1);
  const [type, setType] = useState<SubstitutionType>('Manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!from || !to) return setError('Select both the original medicine and its alternative.');
    if (from.medicine_id === to.medicine_id) return setError('A medicine cannot substitute itself.');

    setSaving(true);
    try {
      await createSubstitution({ medicine_id: from.medicine_id, substitute_medicine_id: to.medicine_id, priority, type });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create substitution rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">Add New Rule</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <p className="modal-subtitle">Configure a pre-approved medicine substitution.</p>

        <MedicinePicker label="From Medicine" value={from} onChange={setFrom} exclude={to?.medicine_id} />
        <MedicinePicker label="To Medicine (Alternative)" value={to} onChange={setTo} exclude={from?.medicine_id} />

        <div className="modal-grid" style={{ marginTop: 14 }}>
          <div className="modal-field">
            <label>Priority</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={1}>1 — First Priority</option>
              <option value={2}>2 — Second Priority</option>
              <option value={3}>3 — Third Priority</option>
              <option value={4}>4+ — Lower Priority</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as SubstitutionType)}>
              <option value="Auto">Auto</option>
              <option value="Manual">Manual</option>
            </select>
          </div>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="modal-btn primary" onClick={submit} disabled={saving}>
            <SaveIcon /> {saving ? 'Saving…' : 'Add Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubstitutionRuleModal;
