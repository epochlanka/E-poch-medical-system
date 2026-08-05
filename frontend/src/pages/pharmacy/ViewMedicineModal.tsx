import { useApiData } from '../../hooks/useApiData';
import { listBatches } from '../../lib/inventory';
import type { MedicineStockRow } from '../../lib/medicines';
import { MedicineIcon, EditIcon } from '../../components/layout/Icons';
import { formatCurrency, formatDate, medicineCode, categoryBadgeClass } from './pharmacyUtils';

interface ViewMedicineModalProps {
  medicine: MedicineStockRow;
  onClose: () => void;
  onEdit: () => void;
}

const STATUS_BADGE: Record<MedicineStockRow['stockStatus'], string> = {
  'in-stock': 'badge-green',
  low: 'badge-amber',
  'out-of-stock': 'badge-red',
};
const STATUS_LABEL: Record<MedicineStockRow['stockStatus'], string> = {
  'in-stock': 'In Stock',
  low: 'Low Stock',
  'out-of-stock': 'Out of Stock',
};

const ViewMedicineModal = ({ medicine, onClose, onEdit }: ViewMedicineModalProps) => {
  const { data: batchResult, loading } = useApiData(() => listBatches({ medicineId: medicine.medicine_id, limit: 20 }), [medicine.medicine_id]);
  const batches = batchResult?.data ?? [];
  const margin = medicine.sell_price - medicine.buy_price;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="pat-view-header">
          <div className="pat-view-avatar">
            <MedicineIcon />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="modal-title" style={{ marginBottom: 2 }}>
              {medicine.name}
            </h3>
            <p className="modal-subtitle" style={{ margin: 0 }}>
              {medicineCode(medicine.medicine_id)} {medicine.generic_name ? `· ${medicine.generic_name}` : ''}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[medicine.stockStatus]}`}>{STATUS_LABEL[medicine.stockStatus]}</span>
        </div>

        <div className="pat-view-grid">
          <div className="pat-view-field">
            <span className="pat-view-label">Category</span>
            <span className="pat-view-value">
              {medicine.category ? <span className={`badge ${categoryBadgeClass(medicine.category)}`}>{medicine.category}</span> : '—'}
            </span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Form / Strength</span>
            <span className="pat-view-value">{[medicine.form, medicine.strength].filter(Boolean).join(' · ') || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Unit</span>
            <span className="pat-view-value">{medicine.unit}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Min / Max Stock</span>
            <span className="pat-view-value">
              {medicine.reorder_level} / {medicine.max_stock_level || '—'}
            </span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Buy Price</span>
            <span className="pat-view-value">{formatCurrency(medicine.buy_price)}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Sell Price</span>
            <span className="pat-view-value">{formatCurrency(medicine.sell_price)}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Margin</span>
            <span className="pat-view-value" style={{ color: margin >= 0 ? '#16a34a' : '#dc2626' }}>
              {formatCurrency(margin)}
            </span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Current Stock</span>
            <span className="pat-view-value">
              {medicine.totalQty} {medicine.unit}(s)
            </span>
          </div>
        </div>

        <div className="card-header" style={{ marginTop: 18 }}>
          <h3 className="card-title">Batches ({batches.length})</h3>
        </div>

        <div className="pat-table-scroll" style={{ maxHeight: 220 }}>
          <table className="pat-table">
            <thead>
              <tr>
                <th>Batch No</th>
                <th>Expiry</th>
                <th>Qty on Hand</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="pat-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && batches.length === 0 && (
                <tr>
                  <td colSpan={5} className="pat-muted">
                    No batches recorded for this medicine.
                  </td>
                </tr>
              )}
              {!loading &&
                batches.map((b) => (
                  <tr key={b.batchId}>
                    <td>{b.batchNo}</td>
                    <td>{formatDate(b.expiryDate)}</td>
                    <td>{b.qtyOnHand}</td>
                    <td>{b.location || <span className="pat-muted">—</span>}</td>
                    <td>
                      <span
                        className={`badge ${b.status === 'Active' ? 'badge-green' : b.status === 'Expired' ? 'badge-red' : 'badge-gray'}`}
                      >
                        {b.status}
                      </span>
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
              <EditIcon /> Edit Medicine
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewMedicineModal;
