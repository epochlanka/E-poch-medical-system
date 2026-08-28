import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { searchMedicines } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { listBatches, updateBatchLocation } from '../../lib/inventory';
import type { Batch } from '../../lib/inventory';
import type { MedicineStockRow } from '../../lib/medicines';
import { formatDate } from './pharmacyUtils';
import { SearchIcon } from '../../components/layout/Icons';

interface StockTransferModalProps {
  medicine?: MedicineStockRow | null;
  onClose: () => void;
  onSuccess: () => void;
}

const StockTransferModal = ({ medicine, onClose, onSuccess }: StockTransferModalProps) => {
  const [selected, setSelected] = useState<{ medicine_id: number; name: string } | null>(
    medicine ? { medicine_id: medicine.medicine_id, name: medicine.name } : null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [location, setLocation] = useState('');
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
    setLocation('');
    listBatches({ medicineId: selected.medicine_id, limit: 50 })
      .then((res) => {
        const active = res.data.filter((b) => b.status !== 'Expired');
        setBatches(active);
        if (active.length === 1) {
          setBatchId(active[0].batchId);
          setLocation(active[0].location ?? '');
        }
      })
      .finally(() => setLoadingBatches(false));
  }, [selected]);

  const handleBatchChange = (id: number) => {
    setBatchId(id);
    const b = batches.find((x) => x.batchId === id);
    setLocation(b?.location ?? '');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!batchId) {
      setError('Select a batch to relocate.');
      return;
    }
    if (!location.trim()) {
      setError('Enter the new location.');
      return;
    }
    setSubmitting(true);
    try {
      await updateBatchLocation(batchId, location.trim());
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to transfer stock.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Stock Transfer</h3>
        <p className="modal-subtitle">Move a batch to a different storage location — quantity stays the same.</p>

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
                <select value={batchId ?? ''} onChange={(e) => handleBatchChange(Number(e.target.value))}>
                  <option value="" disabled>
                    Select a batch…
                  </option>
                  {batches.map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.batchNo} — {b.qtyOnHand} on hand, expires {formatDate(b.expiryDate)}
                      {b.location ? ` (currently: ${b.location})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="modal-field" style={{ marginTop: 14 }}>
              <label>New location *</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Store / Shelf A-01" />
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="modal-btn primary" disabled={submitting || !batchId}>
                {submitting ? 'Saving…' : 'Transfer Stock'}
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

export default StockTransferModal;
