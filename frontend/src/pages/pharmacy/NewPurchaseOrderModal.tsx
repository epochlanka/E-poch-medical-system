import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listSuppliers, createPurchaseOrder } from '../../lib/suppliers';
import { searchMedicines, getMedicine } from '../../lib/medicines';
import type { Medicine } from '../../lib/medicines';
import { SearchIcon, TrashIcon, PlusIcon } from '../../components/layout/Icons';
import { formatCurrency } from './pharmacyUtils';

interface OrderLine {
  medicine_id: number;
  name: string;
  qty_ordered: number;
  unit_cost: number;
}

interface NewPurchaseOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const NewPurchaseOrderModal = ({ onClose, onSuccess }: NewPurchaseOrderModalProps) => {
  const { data: suppliers } = useApiData(() => listSuppliers());
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchMedicines(searchTerm).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const addLine = async (m: Medicine) => {
    setSearchTerm('');
    setResults([]);
    if (lines.some((l) => l.medicine_id === m.medicine_id)) return;
    let unitCost = 0;
    try {
      const detail = await getMedicine(m.medicine_id);
      unitCost = detail.buy_price;
    } catch {
      // fall back to 0 if the lookup fails — the pharmacist can still fill it in manually
    }
    setLines((ls) => [...ls, { medicine_id: m.medicine_id, name: m.name, qty_ordered: 1, unit_cost: unitCost }]);
  };

  const updateLine = (medicineId: number, patch: Partial<OrderLine>) =>
    setLines((ls) => ls.map((l) => (l.medicine_id === medicineId ? { ...l, ...patch } : l)));

  const removeLine = (medicineId: number) => setLines((ls) => ls.filter((l) => l.medicine_id !== medicineId));

  const total = lines.reduce((sum, l) => sum + l.qty_ordered * l.unit_cost, 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError('Select a supplier.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one medicine to the order.');
      return;
    }
    setSubmitting(true);
    try {
      await createPurchaseOrder({
        supplier_id: Number(supplierId),
        order_date: new Date(orderDate).toISOString(),
        expected_date: expectedDate ? new Date(expectedDate).toISOString() : undefined,
        items: lines.map((l) => ({ medicine_id: l.medicine_id, qty_ordered: l.qty_ordered, unit_cost: l.unit_cost })),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to create purchase order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">New Purchase Order</h3>
        <p className="modal-subtitle">Order stock from a supplier. Received quantities are recorded separately as a GRN.</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field">
              <label>Supplier *</label>
              <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="" disabled>
                  Select a supplier…
                </option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>Order date</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Expected date</label>
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="modal-field" style={{ marginTop: 14 }}>
            <label>Add medicine</label>
            <div className="pat-search" style={{ background: '#f8fafc' }}>
              <SearchIcon />
              <input placeholder="Search by name or generic name…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            {results.length > 0 && (
              <div className="ph-search-results">
                {results.map((m) => (
                  <button type="button" key={m.medicine_id} className="ph-search-result" onClick={() => addLine(m)}>
                    <span>{m.name}</span>
                    <span className="pat-muted">{m.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="pat-table-scroll" style={{ marginTop: 12 }}>
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Line Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.medicine_id}>
                      <td>{l.name}</td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={l.qty_ordered}
                          onChange={(e) => updateLine(l.medicine_id, { qty_ordered: Number(e.target.value) })}
                          style={{ width: 64 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unit_cost}
                          onChange={(e) => updateLine(l.medicine_id, { unit_cost: Number(e.target.value) })}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td>{formatCurrency(l.qty_ordered * l.unit_cost)}</td>
                      <td>
                        <button type="button" className="pat-icon-btn" onClick={() => removeLine(l.medicine_id)} aria-label="Remove">
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', padding: '10px 4px', fontWeight: 700, color: '#0f172a' }}>
                Estimated Total: {formatCurrency(total)}
              </div>
            </div>
          )}
          {lines.length === 0 && (
            <div className="card-empty" style={{ marginTop: 8 }}>
              <PlusIcon /> No items yet — search above to add medicines to this order.
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewPurchaseOrderModal;
