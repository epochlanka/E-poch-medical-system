import { useApiData } from '../../hooks/useApiData';
import { listPurchaseOrders } from '../../lib/suppliers';
import type { Supplier } from '../../lib/suppliers';
import { SupplierIcon, EditIcon } from '../../components/layout/Icons';
import { formatDate, formatCurrency, poCode, STATUS_BADGE, STATUS_LABEL } from '../purchaseOrders/purchaseOrderUtils';

interface ViewSupplierModalProps {
  supplier: Supplier;
  onClose: () => void;
  onEdit: () => void;
}

const ViewSupplierModal = ({ supplier, onClose, onEdit }: ViewSupplierModalProps) => {
  const { data: orders, loading } = useApiData(
    () => listPurchaseOrders({ supplierId: supplier.supplier_id, limit: 10 }),
    [supplier.supplier_id]
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className="pat-view-header">
          <div className="pat-view-avatar">
            <SupplierIcon />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="modal-title" style={{ marginBottom: 2 }}>
              {supplier.name}
            </h3>
            <p className="modal-subtitle" style={{ margin: 0 }}>
              {supplier.city || 'No city on file'}
            </p>
          </div>
          <span className={`badge ${supplier.is_active ? 'badge-green' : 'badge-gray'}`}>{supplier.is_active ? 'Active' : 'Inactive'}</span>
        </div>

        <div className="pat-view-grid">
          <div className="pat-view-field">
            <span className="pat-view-label">Contact Person</span>
            <span className="pat-view-value">{supplier.contact_person || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Phone</span>
            <span className="pat-view-value">{supplier.phone || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Email</span>
            <span className="pat-view-value">{supplier.email || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Payment Terms</span>
            <span className="pat-view-value">Net {supplier.payment_terms_days} days</span>
          </div>
          <div className="pat-view-field span-2">
            <span className="pat-view-label">Address</span>
            <span className="pat-view-value">{supplier.address || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Total Orders</span>
            <span className="pat-view-value">{supplier.totalOrders}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Total Payable</span>
            <span className="pat-view-value">{formatCurrency(supplier.totalPayable)}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Overdue Payable</span>
            <span className="pat-view-value" style={{ color: supplier.overduePayable > 0 ? '#dc2626' : undefined }}>
              {formatCurrency(supplier.overduePayable)}
            </span>
          </div>
        </div>

        <div className="card-header" style={{ marginTop: 18 }}>
          <h3 className="card-title">Recent Orders</h3>
        </div>
        <div className="pat-table-scroll" style={{ maxHeight: 220 }}>
          <table className="pat-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Order Date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="pat-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && (orders?.data.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="pat-muted">
                    No purchase orders yet for this supplier.
                  </td>
                </tr>
              )}
              {!loading &&
                orders?.data.map((po) => (
                  <tr key={po.po_id}>
                    <td>{poCode(po.po_id, po.order_date)}</td>
                    <td>{formatDate(po.order_date)}</td>
                    <td>{formatCurrency(po.totalAmount)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[po.status]}`}>{STATUS_LABEL[po.status]}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="modal-btn primary" onClick={onEdit}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <EditIcon /> Edit Supplier
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewSupplierModal;
