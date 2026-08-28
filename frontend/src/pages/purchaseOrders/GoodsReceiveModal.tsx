import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listPurchaseOrders, getPurchaseOrder, receiveGrn } from '../../lib/suppliers';
import type { PurchaseOrder, PurchaseOrderDetail } from '../../lib/suppliers';
import { poCode } from './purchaseOrderUtils';

interface GoodsReceiveModalProps {
  po?: PurchaseOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface ReceiveLine {
  po_item_id: number;
  medicineName: string;
  unit: string;
  remaining: number;
  qty_received: string;
  batch_no: string;
  expiry_date: string;
}

const remainingQty = (item: PurchaseOrderDetail['items'][number]) =>
  item.qty_ordered - (item.grn_items ?? []).reduce((s, g) => s + g.qty_received, 0);

const GoodsReceiveModal = ({ po, onClose, onSuccess }: GoodsReceiveModalProps) => {
  const [selectedPoId, setSelectedPoId] = useState<number | null>(po?.po_id ?? null);
  const { data: openOrders } = useApiData(() => listPurchaseOrders({ limit: 100 }), []);
  const { data: detail, loading: loadingDetail } = useApiData(
    () => (selectedPoId ? getPurchaseOrder(selectedPoId) : Promise.resolve(null)),
    [selectedPoId]
  );

  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) {
      setLines([]);
      return;
    }
    setLines(
      detail.items
        .map((item) => ({
          po_item_id: item.po_item_id,
          medicineName: item.medicine?.name ?? `Medicine #${item.medicine_id}`,
          unit: item.medicine?.unit ?? '',
          remaining: remainingQty(item),
          qty_received: String(remainingQty(item)),
          batch_no: '',
          expiry_date: '',
        }))
        .filter((l) => l.remaining > 0)
    );
  }, [detail]);

  const receivableOrders = (openOrders?.data ?? []).filter((o) => o.status === 'Submitted' || o.status === 'PartiallyReceived');

  const updateLine = (poItemId: number, patch: Partial<ReceiveLine>) =>
    setLines((ls) => ls.map((l) => (l.po_item_id === poItemId ? { ...l, ...patch } : l)));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedPoId) return;

    const toSubmit = lines.filter((l) => Number(l.qty_received) > 0);
    if (toSubmit.length === 0) {
      setError('Enter a received quantity for at least one item.');
      return;
    }
    for (const l of toSubmit) {
      if (!l.batch_no.trim() || !l.expiry_date) {
        setError(`Batch number and expiry date are required for ${l.medicineName}.`);
        return;
      }
      if (Number(l.qty_received) > l.remaining) {
        setError(`${l.medicineName}: received quantity can't exceed the remaining ordered quantity (${l.remaining}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await receiveGrn(
        selectedPoId,
        toSubmit.map((l) => ({
          po_item_id: l.po_item_id,
          qty_received: Number(l.qty_received),
          batch_no: l.batch_no.trim(),
          expiry_date: new Date(l.expiry_date).toISOString(),
        }))
      );
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to receive goods.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Goods Receive</h3>
        <p className="modal-subtitle">Record what actually arrived against a submitted purchase order — each line becomes a new batch.</p>

        {!selectedPoId ? (
          <div className="modal-field">
            <label>Select a purchase order *</label>
            {receivableOrders.length === 0 && <p className="pat-muted">No purchase orders are awaiting receipt right now.</p>}
            <div className="ph-search-results" style={{ maxHeight: 260 }}>
              {receivableOrders.map((o) => (
                <button type="button" key={o.po_id} className="ph-search-result" onClick={() => setSelectedPoId(o.po_id)}>
                  <span>
                    {poCode(o.po_id, o.order_date)} · {o.supplier.name}
                  </span>
                  <span className="pat-muted">{o.status === 'PartiallyReceived' ? 'Partially Received' : 'Pending'}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="ph-selected-medicine">
              <span>
                {detail ? `${poCode(detail.po_id, detail.order_date)} · ${detail.supplier.name}` : 'Loading…'}
              </span>
              {!po && (
                <button type="button" className="card-link" onClick={() => setSelectedPoId(null)}>
                  Change
                </button>
              )}
            </div>

            {loadingDetail && <p className="pat-muted" style={{ marginTop: 12 }}>Loading order…</p>}
            {!loadingDetail && lines.length === 0 && (
              <p className="pat-muted" style={{ marginTop: 12 }}>Every item on this order has already been fully received.</p>
            )}

            {lines.length > 0 && (
              <div className="pat-table-scroll" style={{ marginTop: 12 }}>
                <table className="pat-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Qty Received</th>
                      <th>Batch No.</th>
                      <th>Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.po_item_id}>
                        <td>
                          {l.medicineName}
                          <div className="pat-muted" style={{ fontSize: 11.5 }}>
                            {l.remaining} {l.unit} remaining
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={l.remaining}
                            value={l.qty_received}
                            onChange={(e) => updateLine(l.po_item_id, { qty_received: e.target.value })}
                            style={{ width: 70 }}
                          />
                        </td>
                        <td>
                          <input value={l.batch_no} onChange={(e) => updateLine(l.po_item_id, { batch_no: e.target.value })} style={{ width: 130 }} />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={l.expiry_date}
                            onChange={(e) => updateLine(l.po_item_id, { expiry_date: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <div className="modal-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="modal-btn primary" disabled={submitting || lines.length === 0}>
                {submitting ? 'Saving…' : 'Record Receipt'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default GoodsReceiveModal;
