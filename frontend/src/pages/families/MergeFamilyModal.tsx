import { useEffect, useState } from 'react';
import { listFamilies, mergeFamilies } from '../../lib/families';
import type { Family } from '../../lib/families';
import { formatFamilyCode } from './familyUtils';
import { SearchIcon } from '../../components/layout/Icons';

interface MergeFamilyModalProps {
  family: Family;
  onClose: () => void;
  onMerged: () => void;
}

// The family the row-menu was opened on is archived (it's the duplicate); the target the
// user picks here survives and absorbs its members — matches mergeFamilies(primary, secondary).
const MergeFamilyModal = ({ family, onClose, onMerged }: MergeFamilyModalProps) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Family[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listFamilies({ search: search || undefined, status: 'active', limit: 8 })
      .then((res) => {
        if (!cancelled) setResults(res.data.filter((f) => f.family_id !== family.family_id));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, family.family_id]);

  const handleMerge = async () => {
    if (!targetId) return;
    setError(null);
    setSubmitting(true);
    try {
      await mergeFamilies(targetId, family.family_id, reason || undefined);
      onMerged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to merge families.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Merge Family</h3>
        <p className="modal-subtitle">
          {family.family_name} ({formatFamilyCode(family.family_id)}) will be archived, and all its patients moved into the family you pick below.
        </p>

        <div className="pat-search" style={{ marginBottom: 12 }}>
          <SearchIcon />
          <input placeholder="Search the surviving family…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 4 }}>
          {loading && <p className="modal-subtitle">Searching…</p>}
          {!loading && results.length === 0 && <p className="modal-subtitle">No other active families found.</p>}
          {!loading &&
            results.map((f) => (
              <div
                key={f.family_id}
                className={`fam-merge-option${targetId === f.family_id ? ' selected' : ''}`}
                onClick={() => setTargetId(f.family_id)}
              >
                <span>
                  <strong>{f.family_name}</strong> · {formatFamilyCode(f.family_id)}
                </span>
                <span className="fam-muted">{f._count.patients} members</span>
              </div>
            ))}
        </div>

        <div className="modal-field" style={{ marginTop: 10 }}>
          <label>Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate household created at registration" />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="modal-btn primary" onClick={handleMerge} disabled={submitting || !targetId}>
            {submitting ? 'Merging…' : 'Merge Family'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergeFamilyModal;
