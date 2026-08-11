import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getDoctorDashboard, getAlerts, getFollowUps } from '../../lib/dashboard';
import {
  PatientsIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarIcon,
  PrescriptionIcon,
  RefreshIcon,
  AlertIcon,
  ExpiryIcon,
  PhoneIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import KpiCard from './KpiCard';
import './dashboard.css';
import './doctor-dashboard.css';
import '../../styles/shared.css';

const STATUS_BADGE: Record<string, string> = {
  Waiting: 'badge-gray',
  Called: 'badge-blue',
  Consulting: 'badge-amber',
  Completed: 'badge-green',
  Skipped: 'badge-red',
  Cancelled: 'badge-red',
  'No Show': 'badge-red',
};

const RX_BADGE: Record<string, string> = {
  Pending: 'badge-amber',
  Preparing: 'badge-blue',
  Dispensed: 'badge-green',
  Collected: 'badge-green',
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const ConsultationsChart = ({ series }: { series: { date: string; count: number }[] }) => {
  const width = 640;
  const height = 220;
  const padding = { top: 26, bottom: 28, left: 12, right: 12 };
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(5, ...series.map((d) => d.count));
  const step = series.length > 1 ? (width - padding.left - padding.right) / (series.length - 1) : 0;

  const todayKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const points = series.map((d, i) => {
    const x = padding.left + i * step;
    const y = padding.top + (chartHeight - (d.count / max) * chartHeight);
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg className="dr-line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight * f} y2={padding.top + chartHeight * f} className="dr-line-grid" />
      ))}
      <path d={pathD} className="dr-line-path" fill="none" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={p.x} cy={p.y} r={4} className={p.date === todayKey ? 'dr-line-dot today' : 'dr-line-dot'} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" className="dr-line-value">
            {p.count}
          </text>
          <text x={p.x} y={height - 8} textAnchor="middle" className={p.date === todayKey ? 'dr-line-axis today' : 'dr-line-axis'}>
            {WEEKDAY_LABELS[i] ?? ''}
          </text>
        </g>
      ))}
    </svg>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const { data: dash, loading, error, reload } = useApiData(getDoctorDashboard);
  const { data: followUps } = useApiData(getFollowUps);
  const { data: alerts } = useApiData(getAlerts);

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const series = dash?.consultationsOverview ?? [];
  const totalThisWeek = series.reduce((sum, d) => sum + d.count, 0);
  const avgPerDay = series.length ? totalThisWeek / series.length : 0;
  const bestDay = series.length ? Math.max(...series.map((d) => d.count)) : 0;
  const todaysCount = series.find((d) => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return d.date === `${y}-${m}-${day}`;
  })?.count ?? 0;

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Doctor Dashboard</h1>
          <p>Welcome back, Dr. {user?.username}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dash-date-chip">
            <CalendarIcon />
            {dateLabel} · {timeLabel}
          </div>
          <button className="pat-icon-btn" onClick={reload} aria-label="Refresh" title="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load dashboard data: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Appointments"
          value={String(dash?.kpis.totalAppointmentsToday ?? 0)}
          changePct={dash?.kpis.totalAppointmentsTodayChangePct}
          compareLabel="yesterday"
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Completed Consultations"
          value={String(dash?.kpis.completedConsultationsToday ?? 0)}
          changePct={dash?.kpis.completedConsultationsTodayChangePct}
          compareLabel="yesterday"
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Pending Consultations"
          value={String(dash?.kpis.pendingConsultationsInQueue ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>In Queue</span>}
        />
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Follow-ups Due"
          value={String(dash?.kpis.followUpsDueThisWeek ?? 0)}
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>This Week</span>}
        />
        <KpiCard
          icon={<PrescriptionIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Prescriptions Issued"
          value={String(dash?.kpis.prescriptionsIssuedToday ?? 0)}
          changePct={dash?.kpis.prescriptionsIssuedTodayChangePct}
          compareLabel="yesterday"
          loading={loading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Today</span>}
        />
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Today's Schedule</h3>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && (dash?.todaysSchedule.length ?? 0) === 0 && <div className="card-empty">No appointments scheduled today.</div>}
          {!loading && (dash?.todaysSchedule.length ?? 0) > 0 && (
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dash!.todaysSchedule.map((a) => (
                    <tr key={a.appointmentId}>
                      <td style={{ fontWeight: 600 }}>{formatTime(a.scheduledAt)}</td>
                      <td>
                        <div>{a.patientName}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {a.patientId}
                        </span>
                      </td>
                      <td>Consultation</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[a.status] ?? 'badge-gray'}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Consultations Overview</h3>
            <span className="card-subtitle">This week</span>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && <ConsultationsChart series={series} />}
          <div className="qa-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 8 }}>
            <div className="dr-mini-stat">
              <div className="dr-mini-stat-value">{totalThisWeek}</div>
              <div className="dr-mini-stat-label">Total This Week</div>
            </div>
            <div className="dr-mini-stat">
              <div className="dr-mini-stat-value">{avgPerDay.toFixed(1)}</div>
              <div className="dr-mini-stat-label">Average / Day</div>
            </div>
            <div className="dr-mini-stat">
              <div className="dr-mini-stat-value" style={{ color: '#16a34a' }}>
                {todaysCount}
              </div>
              <div className="dr-mini-stat-label">Today</div>
            </div>
            <div className="dr-mini-stat">
              <div className="dr-mini-stat-value" style={{ color: '#7c3aed' }}>
                {bestDay}
              </div>
              <div className="dr-mini-stat-label">Best Day</div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-3">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Follow-ups Due</h3>
          </div>
          {!followUps && <div className="card-empty">Loading…</div>}
          {followUps?.length === 0 && <div className="card-empty">Nothing due.</div>}
          {followUps?.slice(0, 6).map((f) => (
            <div className="appt-row" key={f.consultationId}>
              <div className="appt-avatar">{f.patientName.slice(0, 2).toUpperCase()}</div>
              <div className="appt-info">
                <div className="appt-name">{f.patientName}</div>
                <span className="appt-mrn">{f.patientId}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: f.isOverdue ? '#dc2626' : '#b45309' }}>{f.isOverdue ? 'Overdue' : 'Due'}</div>
                <div className="pat-muted" style={{ fontSize: 11 }}>
                  {new Date(f.followUpDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
              </div>
              {f.patientPhone && (
                <a className="pat-icon-btn" href={`tel:${f.patientPhone}`} aria-label={`Call ${f.patientName}`} style={{ marginLeft: 8 }}>
                  <PhoneIcon />
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Prescriptions</h3>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && (dash?.recentPrescriptions.length ?? 0) === 0 && <div className="card-empty">No prescriptions issued yet.</div>}
          {dash?.recentPrescriptions.map((rx) => (
            <div className="rx-row" key={rx.prescriptionId}>
              <div className="rx-icon">
                <PrescriptionIcon />
              </div>
              <div className="rx-info">
                <div className="rx-name">{rx.patientName}</div>
                <span className="rx-time">{formatTime(rx.issuedAt)}</span>
              </div>
              <span className={`badge ${RX_BADGE[rx.status] ?? 'badge-gray'}`}>{rx.status}</span>
              <ChevronRightIcon />
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Alerts &amp; Notifications</h3>
          </div>
          {!alerts && <div className="card-empty">Loading…</div>}
          {alerts?.length === 0 && <div className="card-empty">No active alerts.</div>}
          {alerts?.slice(0, 6).map((a, i) => (
            <div className="alert-row" key={i}>
              <div className={`alert-icon ${a.severity}`}>{a.type.includes('expir') ? <ExpiryIcon /> : <AlertIcon />}</div>
              <div className="alert-text">{a.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
