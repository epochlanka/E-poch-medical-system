import { useEffect, useRef, useState } from 'react';

export const CLINIC_INSTRUCTIONS = [
  'Before food',
  'After food',
  'With food',
  'Before breakfast',
  'After breakfast',
  'Before lunch',
  'After lunch',
  'Before dinner',
  'After dinner',
  'At bedtime',
  'With plenty of water',
  'As directed by doctor',
  'For external use only',
  'Shake well before use',
];

// Multi-select instruction chips with predefined options + a custom-entry escape hatch — shared
// by the clinic Prescription Items table (NewPrescription.tsx) and the External Medicines form,
// since both need the exact same "After food ×  With plenty of water ×" chip UX.
const InstructionsPicker = ({
  chips,
  onChange,
  options = CLINIC_INSTRUCTIONS,
}: {
  chips: string[];
  onChange: (chips: string[]) => void;
  options?: string[];
}) => {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    // Capture phase, not bubble: when this picker is used inside a modal (ExternalMedicineSection),
    // the modal card's own onClick calls stopPropagation() to keep backdrop-click-to-close from
    // firing on internal clicks — that also silently swallows a bubble-phase document listener
    // before it ever runs, so this listener would never fire and the dropdown could only be
    // closed by clicking the backdrop itself. Capture runs top-down before any bubble-phase
    // stopPropagation can block it.
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const toggle = (opt: string) => {
    onChange(chips.includes(opt) ? chips.filter((c) => c !== opt) : [...chips, opt]);
    setOpen(false);
  };
  const remove = (opt: string) => onChange(chips.filter((c) => c !== opt));
  const addCustom = () => {
    const v = customDraft.trim();
    if (v && !chips.includes(v)) onChange([...chips, v]);
    setCustomDraft('');
    setShowCustom(false);
  };

  return (
    <div className="rxp-instr-picker" ref={ref}>
      {chips.length > 0 && (
        <div className="cons-chips" style={{ marginBottom: 6 }}>
          {chips.map((c) => (
            <span className="cons-chip" key={c}>
              {c}
              <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <button type="button" className="rxb-table-input rxp-instr-btn" onClick={() => setOpen((v) => !v)}>
        {chips.length ? '+ Add Instruction' : 'Select instructions…'}
      </button>
      {open && (
        <div className="rxb-search-dropdown rxp-instr-dropdown">
          {options.map((opt) => (
            <div className="rxb-search-result" key={opt} onClick={() => toggle(opt)}>
              <span className="rxb-search-result-name">
                {chips.includes(opt) ? '✓ ' : ''}
                {opt}
              </span>
            </div>
          ))}
          {!showCustom ? (
            <div className="rxb-search-result" onClick={() => setShowCustom(true)}>
              <span className="rxb-search-result-name" style={{ color: '#2563eb', fontWeight: 700 }}>
                + Custom Instruction
              </span>
            </div>
          ) : (
            <div style={{ padding: 10, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <input
                className="rxb-table-input"
                autoFocus
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
                placeholder="Custom instruction…"
              />
              <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '4px 8px' }} onClick={addCustom}>
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InstructionsPicker;
