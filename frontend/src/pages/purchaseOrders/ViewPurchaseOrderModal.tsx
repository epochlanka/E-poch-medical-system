import { useApiData } from '../../hooks/useApiData';
import { getPurchaseOrder } from '../../lib/suppliers';
import { PurchaseOrderIcon } from '../../components/layout/Icons';
import { formatDate, formatCurrency, poCode, STATUS_BADGE, STATUS_LABEL } from './purchaseOrderUtils';

interface ViewPurchaseOrderModalProps {
  poId: number;
  onClose: () => void;
}

const ViewPurchaseOrderModal = ({ poId, onClose }: ViewPurchaseOrderModalProps) => {
  const { data: po, loading } = useApiData(() => getPurchaseOrder(poId), [poId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        {loading && <p className="pat-muted">Loading…</p>}
        {po && (
          <>
            <div className="pat-view-header">
              <div className="pat-view-avatar">
                <PurchaseOrderIcon />
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="modal-title" style={{ marginBottom: 2 }}>
                  {poCode(po.po_id, po.order_date)}
                </h3>
                <p className="modal-subtitle" style={{ margin: 0 }}>
                  {po.supplier.name}
                </p>
              </div>
              <span className={`badge ${STATUS_BADGE[po.status]}`}>{STATUS_LABEL[po.status]}</span>
            </div>

            <div className="pat-view-grid">
              <div className="pat-view-field">
                <span className="pat-view-label">Order Date</span>
                <span className="pat-view-value">{formatDate(po.order_date)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Expected Date</span>
                <span className="pat-view-value">{po.expected_date ? formatDate(po.expected_date) : '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Total Amount</span>
                <span className="pat-view-value">{formatCurrency(po.totalAmount)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Received Amount</span>
                <span className="pat-view-value">{formatCurrency(po.receivedAmount)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Pending Amount</span>
                <span className="pat-view-value">{formatCurrency(po.pendingAmount)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Received</span>
                <span className="pat-view-value">
                  {po.receivedQty} / {po.orderedQty} units ({po.receivedPct}%)
                </span>
              </div>
            </div>

            <div className="card-header" style={{ marginTop: 18 }}>
              <h3 className="card-title">Items ({po.items.length})</h3>
            </div>
            <div className="pat-table-scroll" style={{ maxHeight: 220 }}>
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Unit Cost</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((item) => {
                    const received = (item.grn_items ?? []).reduce((s, g) => s + g.qty_received, 0);
                    return (
                      <tr key={item.po_item_id}>
                        <td>{item.medicine?.name ?? `#${item.medicine_id}`}</td>
                        <td>{item.qty_ordered}</td>
                        <td>{received}</td>
                        <td>{formatCurrency(item.unit_cost ?? 0)}</td>
                        <td>{formatCurrency(item.qty_ordered * (item.unit_cost ?? 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {po.grns.length > 0 && (
              <>
                <div className="card-header" style={{ marginTop: 18 }}>
                  <h3 className="card-title">Receipt History ({po.grns.length})</h3>
                </div>
                {po.grns.map((grn) => (
                  <div className="alert-row" key={grn.grn_id}>
                    <div className={`alert-icon ${grn.has_discrepancy ? 'red' : 'amber'}`}>
                      <PurchaseOrderIcon />
                    </div>
                    <div className="alert-text">
                      <strong>GRN #{grn.grn_id}</strong>
                      <div className="pat-muted">
                        {formatDate(grn.received_at)} · {grn.items.reduce((s, i) => s + i.qty_received, 0)} units received
                        {grn.has_discrepancy && ' · Discrepancy flagged'}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewPurchaseOrderModal;
