import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getReceptionistDashboard } from '../../lib/dashboard';
import type { QueueStatus } from '../../lib/dashboard';
import {
  PatientsIcon,
  UserPlusIcon,
  InvoiceIcon,
  DollarIcon,
  ClockIcon,
  CalendarIcon,
  RefreshIcon,
  SearchIcon,
  PlusIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import KpiCard from './KpiCard';
import '../../styles/shared.css';
import './dashboard.css';
import './reception-dashboard.css';

const STATUS_BADGE: Record<QueueStatus, string> = {
  Waiting: 'badge-amber',
  'With Doctor': 'badge-purple',
  'With Pharmacy': 'badge-blue',
  Completed: 'badge-green',
};

const TYPE_BADGE: Record<'Appointment' | 'Walk-in', string> = {
  Appointment: 'badge-blue',
  'Walk-in': 'badge-green',
};

const currency = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'P';

const formatWeekdayLabel = (dateKey: string) => {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

const QUEUE_TABS: { key: 'All' | QueueStatus; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Waiting', label: 'Waiting' },
  { key: 'With Doctor', label: 'With Doctor' },
  { key: 'With Pharmacy', label: 'With Pharmacy' },
  { key: 'Completed', label: 'Completed' },
];

const CHART_SERIES = [
  { key: 'appointments' as const, label: 'Appointments', color: '#2563eb' },
  { key: 'walkIns' as const, label: 'Walk-ins', color: '#16a34a' },
  { key: 'patientsSeen' as const, label: 'Patients Seen', color: '#7c3aed' },
];

const WeeklyOverviewChart = ({ series }: { series: { date: string; appointments: number; walkIns: number; patientsSeen: number }[] }) => {
  const width = 640;
  const height = 220;
  const padding = { top: 16, bottom: 26, left: 12, right: 12 };
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(5, ...series.flatMap((d) => [d.appointments, d.walkIns, d.patientsSeen]));
  const step = series.length > 1 ? (width - padding.left - padding.right) / (series.length - 1) : 0;

  const yFor = (value: number) => padding.top + (chartHeight - (value / max) * chartHeight);

  return (
    <svg className="dr-line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * f} y2={padding.top + chartHeight * f} className="dr-line-grid" />
      ))}
      {CHART_SERIES.map((s) => {
        const points = series.map((d, i) => ({ x: padding.left + i * step, y: yFor(d[s.key]) }));
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <g key={s.key}>
            <path d={pathD} className="dr-line-path" stroke={s.color} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} className="dr-line-dot" stroke={s.color} />
            ))}
          </g>
        );
      })}
      {series.map((d, i) => (
        <text key={d.date} x={padding.left + i * step} y={height - 8} textAnchor="middle" className="dr-line-axis">
          {formatWeekdayLabel(d.date)}
        </text>
      ))}
    </svg>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: dash, loading, error, reload } = useApiData(getReceptionistDashboard);
  const [activeTab, setActiveTab] = useState<'All' | QueueStatus>('All');

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const filteredQueue = useMemo(() => {
    if (!dash) return [];
    if (activeTab === 'All') return dash.todaysQueue;
    return dash.todaysQueue.filter((q) => q.status === activeTab);
  }, [dash, activeTab]);

  const quickActions = [
    { label: 'Register New Patient', icon: <UserPlusIcon />, bg: '#eaf1fe', color: '#2563eb', path: '/patients/register', implemented: true },
    { label: 'Book Appointment', icon: <CalendarIcon />, bg: '#dcfce7', color: '#16a34a', path: '/appointments/book', implemented: true },
    { label: 'Add Walk-in', icon: <PlusIcon />, bg: '#f3e8ff', color: '#7c3aed', path: '/appointments/walk-in', implemented: false },
    { label: 'Search Patient', icon: <SearchIcon />, bg: '#fef3c7', color: '#b45309', path: '/patients/all', implemented: true },
    { label: 'Live Queue Board', icon: <ClockIcon />, bg: '#dbeafe', color: '#1d4ed8', path: '/queue/live', implemented: false },
    { label: 'Create Invoice', icon: <InvoiceIcon />, bg: '#fee2e2', color: '#dc2626', path: '/billing/invoices', implemented: false },
  ];

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>
            {greeting}, {user?.username ?? 'Receptionist'}! 👋
          </h1>
          <p>Here's what's happening at E-Poch Clinic today.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn primary" onClick={() => navigate('/appointments/book')}>
            <PlusIcon /> New Appointment
          </button>
          <button className="pat-btn" onClick={() => navigate('/appointments/walk-in')}>
            <PlusIcon /> Walk-in Patient
          </button>
          <button className="pat-icon-btn" onClick={reload} aria-label="Refresh" title="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load dashboard data: {error}</div>}

      <div className="dash-kpi-row-6">
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Today's Appointments"
          value={String(dash?.kpis.todaysAppointmentsTotal ?? 0)}
          changePct={dash?.kpis.todaysAppointmentsChangePct}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Total</span>}
        />
        <KpiCard
          icon={<UserPlusIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Walk-in Patients"
          value={String(dash?.kpis.walkInPatientsToday ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Patients Seen"
          value={String(dash?.kpis.patientsSeenToday ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<InvoiceIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Invoices Generated"
          value={String(dash?.kpis.invoicesGeneratedToday ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Total Collections"
          value={loading ? '—' : currency(dash?.kpis.totalCollectionsToday ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Avg. Waiting Time"
          value={`${dash?.kpis.avgWaitingTimeMinutes ?? 0} mins`}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Today's Queue</h3>
            <button className="card-link" onClick={() => navigate('/queue/live')}>
              View Full Queue →
            </button>
          </div>

          <div className="rcp-tabs">
            {QUEUE_TABS.map((tab) => {
              const count =
                tab.key === 'All'
                  ? dash?.queueCounts.all ?? 0
                  : tab.key === 'Waiting'
                    ? dash?.queueCounts.waiting ?? 0
                    : tab.key === 'With Doctor'
                      ? dash?.queueCounts.withDoctor ?? 0
                      : tab.key === 'With Pharmacy'
                        ? dash?.queueCounts.withPharmacy ?? 0
                        : dash?.queueCounts.completed ?? 0;
              return (
                <button key={tab.key} className={`rcp-tab${activeTab === tab.key ? ' active' : ''}`} onClick={() => setActiveTab(tab.key)}>
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>

          {loading && <div className="card-empty">Loading…</div>}
          {!loading && filteredQueue.length === 0 && <div className="card-empty">No patients in this part of the queue right now.</div>}
          {!loading && filteredQueue.length > 0 && (
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Doctor</th>
                    <th>Token No.</th>
                    <th>Status</th>
                    <th>Wait Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((q, i) => (
                    <tr key={q.appointmentId}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="pat-name-cell">
                          {q.photoUrl ? (
                            <img className="pat-avatar" src={q.photoUrl} alt="" />
                          ) : (
                            <div className="pat-avatar">{initials(q.patientName)}</div>
                          )}
                          <div>
                            <div className="pat-name">{q.patientName}</div>
                            <span className="pat-muted" style={{ fontSize: 11.5 }}>
                              {q.patientId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[q.type]}`}>{q.type}</span>
                      </td>
                      <td>Dr. {q.doctorName}</td>
                      <td style={{ fontWeight: 700 }}>{q.token}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[q.status]}`}>{q.status}</span>
                      </td>
                      <td className="pat-muted">{q.waitTimeMinutes !== null ? `${q.waitTimeMinutes} mins` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Today's Schedule</h3>
            <button className="card-link" onClick={() => navigate('/appointments/book')}>
              View Calendar
            </button>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && (dash?.todaysSchedule.length ?? 0) === 0 && <div className="card-empty">No appointments scheduled today.</div>}
          {dash?.todaysSchedule.map((s, i) => (
            <div className="rcp-schedule-row" key={`${s.time}-${s.doctorId}-${i}`}>
              <span className={`rcp-schedule-dot ${s.status === 'In Progress' ? 'in-progress' : 'upcoming'}`} />
              <span className="rcp-schedule-time">{s.time}</span>
              <div className="rcp-schedule-info">
                <div className="rcp-schedule-doctor">Dr. {s.doctorName}</div>
                <span className="rcp-schedule-count">
                  {String(s.appointmentCount).padStart(2, '0')} Appointment{s.appointmentCount === 1 ? '' : 's'}
                </span>
              </div>
              <span className={`badge ${s.status === 'In Progress' ? 'badge-green' : 'badge-blue'}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Today's Overview</h3>
            <span className="card-subtitle">Last 7 days</span>
          </div>
          <div className="chart-legend">
            {CHART_SERIES.map((s) => (
              <div className="chart-legend-item" key={s.key}>
                <span className="chart-legend-dot" style={{ background: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && dash && <WeeklyOverviewChart series={dash.weeklyOverview} />}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Quick Actions</h3>
          </div>
          <div className="qa-grid">
            {quickActions.map((qa) => (
              <button key={qa.label} className="qa-btn" onClick={() => navigate(qa.path)}>
                {!qa.implemented && <span className="qa-soon">SOON</span>}
                <span className="qa-icon" style={{ background: qa.bg, color: qa.color }}>
                  {qa.icon}
                </span>
                <span className="qa-label">{qa.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
          <button className="card-link" onClick={() => navigate('/reports/operational')}>
            View All
          </button>
        </div>
        {loading && <div className="card-empty">Loading…</div>}
        {!loading && (dash?.recentActivity.length ?? 0) === 0 && <div className="card-empty">No recent activity.</div>}
        {dash?.recentActivity.map((a) => (
          <div className="rcp-activity-row" key={a.logId}>
            <div className="rcp-activity-icon">
              <ChevronRightIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rcp-activity-text">
                <strong>{a.username}</strong> {a.action.toLowerCase()}d {a.entity.toLowerCase()} #{a.entityId}
              </div>
              <div className="rcp-activity-time">
                {new Date(a.timestamp).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {a.role}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 4 }}>
        <span className="dash-date-chip">{dateLabel}</span>
      </div>
    </div>
  );
};

export default Dashboard;
