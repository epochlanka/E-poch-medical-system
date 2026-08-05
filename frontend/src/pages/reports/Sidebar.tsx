import type { OverviewReport } from '../../lib/reports';
import { AlertIcon, CalendarIcon, ClipboardIcon, ExpiryIcon, InvoiceIcon } from '../../components/layout/Icons';
import { formatDateTime } from './reportsUtils';
import type { ReportTab } from './Reports';

interface SidebarProps {
  overview: OverviewReport | null;
  onPreset: (preset: 'daily' | 'weekly' | 'monthly' | 'yearly') => void;
  onCustomReport: () => void;
  onNavigateTab: (tab: ReportTab) => void;
}

const PRESETS: { key: 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string; sub: string }[] = [
  { key: 'daily', label: 'Daily Report', sub: "View today's summary" },
  { key: 'weekly', label: 'Weekly Report', sub: 'View this week’s summary' },
  { key: 'monthly', label: 'Monthly Report', sub: 'View last 30 days' },
  { key: 'yearly', label: 'Yearly Report', sub: 'View last 12 months' },
];

const Sidebar = ({ overview, onPreset, onCustomReport, onNavigateTab }: SidebarProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quick Report Access</h3>
        </div>
        <div className="rp-quick-list">
          {PRESETS.map((p) => (
            <button key={p.key} className="rp-quick-btn" onClick={() => onPreset(p.key)}>
              <div className="rp-quick-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                <CalendarIcon />
              </div>
              <div>
                <div className="rp-quick-label">{p.label}</div>
                <div className="rp-quick-sub">{p.sub}</div>
              </div>
            </button>
          ))}
          <button className="rp-quick-btn" onClick={onCustomReport}>
            <div className="rp-quick-icon" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
              <ClipboardIcon />
            </div>
            <div>
              <div className="rp-quick-label">Custom Report</div>
              <div className="rp-quick-sub">Build &amp; export a report</div>
            </div>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Alerts &amp; Insights</h3>
        </div>
        {!overview && <div className="card-empty">Loading…</div>}
        {overview && (
          <>
            <button className="alert-row" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => onNavigateTab('inventory')}>
              <div className="alert-icon red">
                <AlertIcon />
              </div>
              <div className="alert-text">
                <strong>Low Stock Alert</strong>
                <div className="pat-muted">{overview.alerts.lowStockCount} medicines are running low</div>
              </div>
            </button>
            <button className="alert-row" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => onNavigateTab('inventory')}>
              <div className="alert-icon amber">
                <ExpiryIcon />
              </div>
              <div className="alert-text">
                <strong>Expiring Soon</strong>
                <div className="pat-muted">{overview.alerts.expiringSoonCount} medicines expire within 30 days</div>
              </div>
            </button>
            <button className="alert-row" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => onNavigateTab('financial')}>
              <div className="alert-icon amber">
                <InvoiceIcon />
              </div>
              <div className="alert-text">
                <strong>Outstanding Payments</strong>
                <div className="pat-muted">{overview.alerts.outstandingInvoicesCount} invoices are pending</div>
              </div>
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
        </div>
        {!overview && <div className="card-empty">Loading…</div>}
        {overview && overview.recentActivity.length === 0 && <div className="card-empty">No recent activity.</div>}
        {overview?.recentActivity.map((a) => (
          <div className="rp-activity-row" key={a.logId}>
            <span>
              <strong>{a.username}</strong> {a.action.toLowerCase()} {a.entity} #{a.entityId}
            </span>
            <div className="rp-activity-time">{formatDateTime(a.timestamp)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
