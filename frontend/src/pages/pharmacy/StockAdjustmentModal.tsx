import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { listBatches, adjustBatch } from '../../lib/inventory';
import type { Batch } from '../../lib/inventory';
import type { MedicineStockRow } from '../../lib/medicines';
import { formatDate } from './pharmacyUtils';
import { SearchIcon } from '../../components/layout/Icons';

interface StockAdjustmentModalProps {
  medicine?: MedicineStockRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

const StockAdjustmentModal = ({ medicine, onClose, onSuccess }: StockAdjustmentModalProps) => {
  const [selected, setSelected] = useState<{ medicine_id: number; name: string } | null>(
    medicine ? { medicine_id: medicine.medicine_id, name: medicine.name } : null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected || !searchTerm.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchMedicines(searchTerm).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm, selected]);

  useEffect(() => {
    if (!selected) return;
    setLoadingBatches(true);
    setBatchId(null);
    listBatches({ medicineId: selected.medicine_id, limit: 50 })
      .then((res) => {
        const active = res.data.filter((b) => b.status !== 'Expired');
        setBatches(active);
        if (active.length === 1) setBatchId(active[0].batchId);
      })
      .finally(() => setLoadingBatches(false));
  }, [selected]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!batchId) {
      setError('Select a batch to adjust.');
      return;
    }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) {
      setError('Enter a quantity greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      await adjustBatch(batchId, direction === 'add' ? qtyNum : -qtyNum, reason);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to adjust stock.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Stock Adjustment</h3>
        <p className="modal-subtitle">Manually correct a batch's on-hand quantity — every adjustment needs a reason.</p>

        {!selected ? (
          <div className="modal-field">
            <label>Find medicine *</label>
            <div className="pat-search" style={{ background: '#f8fafc' }}>
              <SearchIcon />
              <input autoFocus placeholder="Search by name or generic name…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="ph-search-results">
                {results.map((m) => (
                  <button
                    type="button"
                    key={m.medicine_id}
                    className="ph-search-result"
                    onClick={() => {
                      setSelected({ medicine_id: m.medicine_id, name: m.name });
                      setSearchTerm('');
                      setResults([]);
                    }}
                  >
                    <span>{m.name}</span>
                    <span className="pat-muted">{m.totalQty} in stock</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="ph-selected-medicine">
              <span>{selected.name}</span>
              {!medicine && (
                <button type="button" className="card-link" onClick={() => setSelected(null)}>
                  Change
                </button>
              )}
            </div>

            <div className="modal-field" style={{ marginTop: 14 }}>
              <label>Batch *</label>
              {loadingBatches && <p className="pat-muted">Loading batches…</p>}
              {!loadingBatches && batches.length === 0 && <p className="pat-muted">No active batches found for this medicine.</p>}
              {!loadingBatches && batches.length > 0 && (
                <select value={batchId ?? ''} onChange={(e) => setBatchId(Number(e.target.value))}>
                  <option value="" disabled>
                    Select a batch…
                  </option>
                  {batches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.batchNo} — {b.qtyOnHand} on hand, expires {formatDate(b.expiryDate)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="modal-grid" style={{ marginTop: 14 }}>
              <div className="modal-field">
                <label>Direction *</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}>
                  <option value="add">Add stock (+)</option>
                  <option value="remove">Remove stock (−)</option>
                </select>
              </div>
              <div className="modal-field">
                <label>Quantity *</label>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
              </div>
              <div className="modal-field span-2">
                <label>Reason *</label>
                <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count correction, damaged stock" />
              </div>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="modal-btn primary" disabled={submitting || !batchId}>
                {submitting ? 'Saving…' : 'Apply Adjustment'}
              </button>
            </div>
          </form>
        )}

        {!selected && (
          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockAdjustmentModal;
