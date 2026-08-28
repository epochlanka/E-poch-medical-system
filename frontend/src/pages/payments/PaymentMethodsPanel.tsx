import type { PaymentsStats } from '../../lib/billing';
import { formatCurrency } from '../invoices/invoiceUtils';

const METHOD_COLOR: Record<string, string> = {
  Cash: '#22c55e',
  Card: '#2563eb',
  Mobile: '#7c3aed',
};

interface PaymentMethodsPanelProps {
  stats: PaymentsStats | null;
  range: PaymentsStats['range'];
  onRangeChange: (range: PaymentsStats['range']) => void;
}

const PaymentMethodsPanel = ({ stats, range, onRangeChange }: PaymentMethodsPanelProps) => {
  const total = stats?.byMethod.reduce((sum, m) => sum + m.amount, 0) ?? 0;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Payment Methods</h3>
        <select className="pat-select" value={range} onChange={(e) => onRangeChange(e.target.value as PaymentsStats['range'])}>
          <option value="month">This Month</option>
          <option value="quarter">Last 90 Days</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
      </div>
      {!stats && <div className="card-empty">Loading…</div>}
      {stats && stats.byMethod.length === 0 && <div className="card-empty">No payments in this period.</div>}
      {stats?.byMethod.map((m) => (
        <div className="med-row" key={m.method}>
          <div className="med-info">
            <div className="med-name">{m.method}</div>
            <div className="med-bar-track">
              <div className="med-bar-fill" style={{ width: `${total ? (m.amount / total) * 100 : 0}%`, background: METHOD_COLOR[m.method] ?? '#94a3b8' }} />
            </div>
          </div>
          <span className="med-count">{formatCurrency(m.amount)}</span>
        </div>
      ))}
    </div>
  );
};

export default PaymentMethodsPanel;
