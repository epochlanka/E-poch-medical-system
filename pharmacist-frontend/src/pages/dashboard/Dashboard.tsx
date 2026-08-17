import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getPharmacistOverview } from '../../lib/dashboard';
import { getClinicSettings } from '../../lib/settings';
import KpiCard from './KpiCard';
import {
  ClipboardIcon,
  CheckCircleIcon,
  StockIcon,
  ExpiryIcon,
  DollarIcon,
  AlertIcon,
  RefreshIcon,
  ClockIcon,
} from '../../components/layout/Icons';
import '../../styles/shared.css';
import './dashboard.css';
import './pharmacist-dashboard.css';

const formatCurrency = (n: number) => `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DONUT_SIZE = 170;
const DONUT_STROKE = 24;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

const QueueDonut = ({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) => {
  let acc = 0;
  return (
    <div className="ph-donut-row">
      <div className="ph-donut-wrap">
        <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
          <circle cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={DONUT_RADIUS} fill="none" stroke="#eef2f8" strokeWidth={DONUT_STROKE} />
          {total > 0 &&
            segments.map((s) => {
              if (s.value <= 0) return null;
              const dash = (s.value / total) * DONUT_CIRCUMFERENCE;
              const el = (
                <circle
                  key={s.label}
                  cx={DONUT_SIZE / 2}
                  cy={DONUT_SIZE / 2}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE}`}
                  strokeDashoffset={-acc}
                  transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                >
                  <title>
                    {s.label}: {s.value}
                  </title>
                </circle>
              );
              acc += dash;
              return el;
            })}
        </svg>
        <div className="ph-donut-center">
          <div className="ph-donut-total">{total}</div>
          <div className="ph-donut-total-label">Total</div>
        </div>
      </div>
      <div className="ph-donut-legend">
        {segments.map((s) => (
          <div className="ph-donut-legend-row" key={s.label}>
            <span className="ph-donut-dot" style={{ background: s.color }} />
            <span className="ph-donut-legend-label">{s.label}</span>
            <span className="ph-donut-legend-value">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrendChart = ({ series }: { series: { date: string; label: string; itemsDispensed: number }[] }) => {
  const width = 560;
  const height = 200;
  const padding = { top: 26, bottom: 28, left: 16, right: 16 };
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(5, ...series.map((d) => d.itemsDispensed));
  const step = series.length > 1 ? (width - padding.left - padding.right) / (series.length - 1) : 0;

  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const points = series.map((d, i) => ({
    x: padding.left + i * step,
    y: padding.top + (chartHeight - (d.itemsDispensed / max) * chartHeight),
    ...d,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg className="ph-line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * f} y2={padding.top + chartHeight * f} className="ph-line-grid" />
      ))}
      <path d={pathD} className="ph-line-path" fill="none" />
      {points.map((p) => (
        <g key={p.date}>
          <circle cx={p.x} cy={p.y} r={4} className={p.date === todayKey ? 'ph-line-dot today' : 'ph-line-dot'} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" className="ph-line-value">
            {p.itemsDispensed}
          </text>
          <text x={p.x} y={height - 8} textAnchor="middle" className={p.date === todayKey ? 'ph-line-axis today' : 'ph-line-axis'}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const { data: dash, loading, reload } = useApiData(() => getPharmacistOverview(), []);
  const { data: clinic } = useApiData(() => getClinicSettings(), []);

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' });

  const queueSegments = dash
    ? [
        { label: 'Pending', value: dash.queueOverview.pending, color: '#2563eb' },
        { label: 'Preparing', value: dash.queueOverview.preparing, color: '#f59e0b' },
        { label: 'Dispensed', value: dash.queueOverview.dispensedToday, color: '#16a34a' },
        { label: 'Collected', value: dash.queueOverview.collectedToday, color: '#7c3aed' },
      ]
    : [];

  return (
    <div>
      <div className="ph-dash-header">
        <div>
          <h1>Welcome back, {user?.username ?? 'Pharmacist'}!</h1>
          <p>Here's what's happening in your pharmacy today.</p>
        </div>
        <div className="ph-dash-header-actions">
          <div className="ph-date-chip">
            <ClockIcon /> {dateLabel}
          </div>
          <div className="ph-branch-chip">{clinic?.clinic_name ?? 'Main Branch'}</div>
        </div>
      </div>

      <div className="ph-kpi-row">
        <KpiCard
          icon={<ClipboardIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Prescriptions in Queue"
          value={dash ? String(dash.kpis.prescriptionsInQueue) : '—'}
          loading={loading}
          footer={dash ? <div className="ph-kpi-sub">{dash.kpis.pendingCount} Pending &bull; {dash.kpis.preparingCount} Preparing</div> : undefined}
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Dispensed Today"
          value={dash ? String(dash.kpis.dispensedTodayPrescriptions) : '—'}
          loading={loading}
          footer={dash ? <div className="ph-kpi-sub">Total Items: {dash.kpis.dispensedTodayItems}</div> : undefined}
        />
        <KpiCard
          icon={<StockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Low Stock Items"
          value={dash ? String(dash.kpis.lowStockItemsCount) : '—'}
          loading={loading}
          footer={dash && dash.kpis.lowStockItemsCount > 0 ? <div className="ph-kpi-sub warn">Reorder Recommended</div> : undefined}
        />
        <KpiCard
          icon={<ExpiryIcon />}
          iconBg="#ede9fe"
          iconColor="#6d28d9"
          label="Expiring Batches"
          value={dash ? String(dash.kpis.expiringBatchesCount).padStart(2, '0') : '—'}
          loading={loading}
          footer={<div className="ph-kpi-sub">Within 90 Days</div>}
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Today's Sales (Pharmacy)"
          value={dash ? formatCurrency(dash.kpis.todaysSalesPharmacy) : '—'}
          loading={loading}
          footer={
            dash && dash.kpis.todaysSalesChangePct !== null ? (
              <div className={`ph-kpi-delta ${dash.kpis.todaysSalesChangePct >= 0 ? 'up' : 'down'}`}>
                {dash.kpis.todaysSalesChangePct >= 0 ? '+' : ''}
                {dash.kpis.todaysSalesChangePct.toFixed(1)}% vs yesterday
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="ph-row-3">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Pharmacy Queue Overview</h3>
          </div>
          {dash && <QueueDonut segments={queueSegments} total={dash.queueOverview.total} />}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Dispensing Trend (This Week)</h3>
          </div>
          {dash && <TrendChart series={dash.dispensingTrend} />}
          <div className="ph-trend-legend">
            <span className="ph-trend-dot" /> Total Items Dispensed
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Alerts</h3>
          </div>
          {dash && (
            <>
              <div className="ph-alert-row">
                <span className="ph-alert-icon red">
                  <AlertIcon />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="ph-alert-title">Very Low Stock Items</div>
                  <div className="ph-alert-sub">{dash.alertSummary.veryLowStockCount} items need immediate attention</div>
                </div>
                <span className="ph-alert-count red">{dash.alertSummary.veryLowStockCount}</span>
              </div>
              <div className="ph-alert-row">
                <span className="ph-alert-icon amber">
                  <AlertIcon />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="ph-alert-title">Low Stock Items</div>
                  <div className="ph-alert-sub">{dash.alertSummary.lowStockCount} items below reorder level</div>
                </div>
                <span className="ph-alert-count amber">{dash.alertSummary.lowStockCount}</span>
              </div>
              <div className="ph-alert-row">
                <span className="ph-alert-icon blue">
                  <ClockIcon />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="ph-alert-title">Expiring Within 30 Days</div>
                  <div className="ph-alert-sub">{dash.alertSummary.expiringWithin30Count} batches will expire soon</div>
                </div>
                <span className="ph-alert-count amber">{dash.alertSummary.expiringWithin30Count}</span>
              </div>
              <div className="ph-alert-row">
                <span className="ph-alert-icon purple">
                  <ExpiryIcon />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="ph-alert-title">Expiring Within 31–90 Days</div>
                  <div className="ph-alert-sub">{dash.alertSummary.expiringWithin31To90Count} batches will expire</div>
                </div>
                <span className="ph-alert-count amber">{dash.alertSummary.expiringWithin31To90Count}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="dash-row dash-row-2" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Expiring Batches (Within 90 Days)</h3>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch No.</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                  <th>Available Qty</th>
                  <th>Alert Level</th>
                </tr>
              </thead>
              <tbody>
                {dash && dash.expiringBatches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="pat-empty">
                      No batches expiring within 90 days.
                    </td>
                  </tr>
                )}
                {dash?.expiringBatches.slice(0, 5).map((b) => (
                  <tr key={b.batchId}>
                    <td>{b.medicineName}</td>
                    <td>{b.batchNo}</td>
                    <td>{new Date(b.expiryDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ color: b.alertLevel === 'High' ? '#dc2626' : b.alertLevel === 'Medium' ? '#b45309' : '#16a34a', fontWeight: 600 }}>{b.daysLeft}</td>
                    <td>{b.qtyOnHand}</td>
                    <td>
                      <span className={`badge ${b.alertLevel === 'High' ? 'badge-red' : b.alertLevel === 'Medium' ? 'badge-amber' : 'badge-green'}`}>{b.alertLevel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top Dispensed Medicines Today</h3>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Qty Dispensed</th>
                </tr>
              </thead>
              <tbody>
                {dash && dash.topDispensedToday.length === 0 && (
                  <tr>
                    <td colSpan={2} className="pat-empty">
                      Nothing dispensed yet today.
                    </td>
                  </tr>
                )}
                {dash?.topDispensedToday.map((m) => (
                  <tr key={m.medicineId}>
                    <td>{m.medicineName}</td>
                    <td>{m.qtyDispensed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="ph-dash-footer">
        <span>© {now.getFullYear()} E-Poch Medical System. All rights reserved.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Last updated: {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="pat-btn" onClick={reload}>
            <RefreshIcon /> Refresh Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
