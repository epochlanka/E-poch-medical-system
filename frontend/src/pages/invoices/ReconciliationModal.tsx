import { api } from '../../lib/api';
import { useApiData } from '../../hooks/useApiData';
import { formatCurrency } from './invoiceUtils';

interface Reconciliation {
  date: string;
  totalCollected: number;
  byMethod: Record<string, number>;
  paymentCount: number;
  invoicesCreated: number;
  invoicesVoided: number;
}

const getReconciliation = () => api.get<Reconciliation>('/invoices/reconciliation').then((r) => r.data);

interface ReconciliationModalProps {
  onClose: () => void;
}

const ReconciliationModal = ({ onClose }: ReconciliationModalProps) => {
  const { data, loading, error } = useApiData(getReconciliation);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Cash Reconciliation</h3>
        <p className="modal-subtitle">End-of-day summary of everything collected today.</p>

        {loading && <p className="pat-muted">Loading…</p>}
        {error && <div className="modal-error">{error}</div>}

        {data && (
          <>
            <div className="pat-view-grid">
              <div className="pat-view-field">
                <span className="pat-view-label">Date</span>
                <span className="pat-view-value">{data.date}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Total Collected</span>
                <span className="pat-view-value">{formatCurrency(data.totalCollected)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Payments Recorded</span>
                <span className="pat-view-value">{data.paymentCount}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Invoices Created</span>
                <span className="pat-view-value">{data.invoicesCreated}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Invoices Voided</span>
                <span className="pat-view-value">{data.invoicesVoided}</span>
              </div>
            </div>

            <div className="card-header" style={{ marginTop: 18 }}>
              <h3 className="card-title">By Payment Method</h3>
            </div>
            {Object.keys(data.byMethod).length === 0 && <div className="card-empty">No payments recorded today.</div>}
            {Object.entries(data.byMethod).map(([method, amount]) => (
              <div className="apt-schedule-row" key={method}>
                <span>{method}</span>
                <span className="pat-name">{formatCurrency(amount)}</span>
              </div>
            ))}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationModal;
