import { useEffect, useState } from 'react';
import { searchLabTestCatalog, createLabTestOrder } from '../../lib/labTestOrders';
import type { LabTestCatalogEntry, LabTestOrderPriority } from '../../lib/labTestOrders';
import { SearchIcon, XIcon, SendIcon } from '../../components/layout/Icons';
import './labTestOrders.css';

const PRIORITY_OPTIONS: LabTestOrderPriority[] = ['Routine', 'Urgent', 'STAT'];

const AddLabTestModal = ({ consultationId, onClose, onAdded }: { consultationId: number; onClose: () => void; onAdded: () => void }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<LabTestCatalogEntry[]>([]);
  const [selected, setSelected] = useState<Map<number, LabTestCatalogEntry>>(new Map());
  const [priority, setPriority] = useState<LabTestOrderPriority>('Routine');
  const [clinicalNote, setClinicalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchLabTestCatalog(searchTerm.trim() || undefined).then(setResults);
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const toggle = (test: LabTestCatalogEntry) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(test.test_id)) next.delete(test.test_id);
      else next.set(test.test_id, test);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      setError('Select at least one investigation.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await Promise.all(
        [...selected.values()].map((test) =>
          createLabTestOrder({
            consultation_id: consultationId,
            catalog_test_id: test.test_id,
            priority,
            additional_notes: clinicalNote.trim() || undefined,
          })
        )
      );
      onAdded();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add lab test(s).');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card lab-add-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 className="modal-title">Add Lab Test</h2>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-field">
          <label>Search Investigation</label>
          <div className="lab-search-box">
            <SearchIcon />
            <input autoFocus placeholder="Search test name, code, category…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="modal-field">
          <label>{searchTerm.trim() ? 'Search Results' : 'Suggested Tests'}</label>
          <div className="lab-test-checklist">
            {results.length === 0 && <div className="lab-empty">No matching investigations.</div>}
            {results.map((t) => (
              <label className="lab-test-check-row" key={t.test_id}>
                <input type="checkbox" checked={selected.has(t.test_id)} onChange={() => toggle(t)} />
                <span className="lab-test-check-name">
                  {t.abbreviation || t.test_code} – {t.test_name}
                </span>
                {t.category && <span className="pat-muted" style={{ fontSize: 11 }}>{t.category}</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="modal-field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as LabTestOrderPriority)}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-field">
          <label>Clinical Note / Reason</label>
          <textarea rows={3} value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)} placeholder="Why this investigation is being requested" />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={submit}>
            <SendIcon /> {submitting ? 'Adding…' : `Add Lab Test${selected.size > 1 ? 's' : ''}${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddLabTestModal;
