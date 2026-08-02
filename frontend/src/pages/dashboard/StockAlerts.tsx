import { useApiData } from '../../hooks/useApiData';
import { getAlerts } from '../../lib/dashboard';
import type { Alert } from '../../lib/dashboard';
import { AlertIcon, ExpiryIcon } from '../../components/layout/Icons';

const STOCK_ALERT_TYPES: Alert['type'][] = ['low-stock', 'expiring-batch', 'expired-batch'];

const LABEL: Record<Alert['type'], string> = {
  'low-stock': 'Low Stock',
  'expiring-batch': 'Near Expiry',
  'expired-batch': 'Expired',
  'skipped-appointment': 'Skipped',
};

const StockAlerts = () => {
  const { data, loading, error } = useApiData(getAlerts);
  const alerts = (data ?? []).filter((a) => STOCK_ALERT_TYPES.includes(a.type));

  return (
    <div className="card" id="stock-alerts">
      <div className="card-header">
        <h3 className="card-title">Stock Alerts</h3>
      </div>

      {loading && <div className="card-empty">Loading…</div>}
      {error && <div className="card-empty">{error}</div>}
      {!loading && !error && alerts.length === 0 && <div className="card-empty">No stock alerts right now.</div>}

      {alerts.slice(0, 6).map((a, i) => (
        <div className="alert-row" key={i}>
          <div className={`alert-icon ${a.severity}`}>{a.type === 'expiring-batch' ? <ExpiryIcon /> : <AlertIcon />}</div>
          <div className="alert-text">
            <strong>{LABEL[a.type]}: </strong>
            {a.message}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StockAlerts;
