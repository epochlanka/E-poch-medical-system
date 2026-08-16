import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getClinicalStatistics, downloadReport } from '../../lib/reports';
import {
  RefreshIcon,
  DownloadIcon,
  FilterIcon,
  PatientsIcon,
  UsersIcon,
  PrescriptionIcon,
  CalendarIcon,
  ClockIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import '../dashboard/dashboard.css';
import '../dashboard/doctor-dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../patients/patients.css';
import './reports.css';

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const formatDuration = (seconds: number) => {
  if (!seconds) return '0m 0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

const STATUS_COLOR: Record<string, string> = {
  Waiting: '#94a3b8',
  Called: '#3b82f6',
  Consulting: '#f59e0b',
  Completed: '#16a34a',
  Skipped: '#ef4444',
  Cancelled: '#dc2626',
  'No Show': '#7c3aed',
};

const LineChart = ({ series }: { series: { date: string; count: number }[] }) => {
  const width = 640;
  const height = 220;
  const padding = { top: 26, bottom: 28, left: 12, right: 12 };
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(5, ...series.map((d) => d.count));
  const step = series.length > 1 ? (width - padding.left - padding.right) / (series.length - 1) : 0;
  // Beyond ~14 points, labeling every tick makes the axis unreadable — thin them out.
  const labelEvery = Math.max(1, Math.ceil(series.length / 10));

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
          <circle cx={p.x} cy={p.y} r={3.5} className="dr-line-dot" />
          {i % labelEvery === 0 && (
            <text x={p.x} y={height - 8} textAnchor="middle" className="dr-line-axis">
              {new Date(p.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};

const DonutChart = ({ data }: { data: { status: string; count: number }[] }) => {
  const total = data.reduce((s, d) => s + d.count, 0);
  const size = 160;
  const r = 60;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.map((d) => {
    const fraction = total ? d.count / total : 0;
    const seg = { ...d, fraction, dash: fraction * circumference, offset };
    offset += fraction * circumference;
    return seg;
  });

  return (
    <div className="rpt-donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef1f7" strokeWidth={22} />
        {segments.map((s) =>
          s.dash > 0 ? (
            <circle
              key={s.status}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={STATUS_COLOR[s.status] ?? '#94a3b8'}
              strokeWidth={22}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ) : null
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="rpt-donut-total">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="rpt-donut-total-label">
          Total
        </text>
      </svg>
      <div className="rpt-donut-legend">
        {segments.length === 0 && <span className="pat-muted" style={{ fontSize: 12 }}>No appointments in this range.</span>}
        {segments.map((s) => (
          <div className="rpt-legend-row" key={s.status}>
            <span className="rpt-legend-dot" style={{ background: STATUS_COLOR[s.status] ?? '#94a3b8' }} />
            <span className="rpt-legend-label">{s.status}</span>
            <span className="rpt-legend-value">
              {s.count} ({(s.fraction * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BarChart = ({ data }: { data: { label: string; count: number }[] }) => {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rpt-bar-chart">
      {data.map((d) => (
        <div className="rpt-bar-col" key={d.label}>
          <div className="rpt-bar-track">
            <div className="rpt-bar-fill" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="rpt-bar-value">{d.count}</span>
          </div>
          <span className="rpt-bar-label">{d.label.replace(' Years', '')}</span>
        </div>
      ))}
    </div>
  );
};

const ClinicalStatistics = () => {
  const [from, setFrom] = useState(isoDaysAgo(6));
  const [to, setTo] = useState(todayIso());
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const { data: stats, loading, error, reload } = useApiData(
    () => getClinicalStatistics({ from: appliedFrom, to: appliedTo }),
    [appliedFrom, appliedTo]
  );

  const applyRange = () => {
    setAppliedFrom(from);
    setAppliedTo(to);
    setShowFilters(false);
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    try {
      await downloadReport('clinical-statistics', { from: appliedFrom, to: appliedTo }, format, `clinical_statistics.${format}`);
    } finally {
      setExporting(null);
    }
  };

  const activityRows = useMemo(() => {
    if (!stats) return [];
    const { kpis } = stats;
    return [
      { label: 'Total Consultations', current: kpis.totalConsultations, prior: kpis.priorTotalConsultations, pct: kpis.totalConsultationsChangePct },
      { label: 'New Patients', current: kpis.newPatients, prior: kpis.priorNewPatients, pct: kpis.newPatientsChangePct },
      { label: 'Prescriptions Issued', current: kpis.prescriptionsIssued, prior: kpis.priorPrescriptionsIssued, pct: kpis.prescriptionsIssuedChangePct },
      { label: 'Follow-ups Scheduled', current: kpis.followUpsScheduled, prior: kpis.priorFollowUpsScheduled, pct: kpis.followUpsScheduledChangePct },
    ];
  }, [stats]);

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Clinical Statistics</h1>
          <p>Overview of your clinical activities and key performance indicators.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="dash-date-chip">
            <CalendarIcon />
            {formatDate(appliedFrom)} – {formatDate(appliedTo)}
          </div>
          <button className="pat-btn" onClick={() => setShowFilters((v) => !v)}>
            <FilterIcon /> Filters
          </button>
          <button className="pat-btn" disabled={exporting === 'csv'} onClick={() => handleExport('csv')}>
            <DownloadIcon /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button className="pat-icon-btn" onClick={reload} aria-label="Refresh" title="Refresh">
            <RefreshIcon />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="pat-filter-bar">
          <div className="q-filter-field">
            <span className="q-filter-label">From</span>
            <input type="date" className="q-filter-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="q-filter-field">
            <span className="q-filter-label">To</span>
            <input type="date" className="q-filter-input" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="pat-btn primary" onClick={applyRange}>
            Apply
          </button>
        </div>
      )}

      {error && <div className="dash-error-banner">Couldn't load clinical statistics: {error}</div>}

      <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiCard
          icon={<UsersIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Consultations"
          value={String(stats?.kpis.totalConsultations ?? 0)}
          changePct={stats?.kpis.totalConsultationsChangePct}
          compareLabel="last period"
          loading={loading}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="New Patients"
          value={String(stats?.kpis.newPatients ?? 0)}
          changePct={stats?.kpis.newPatientsChangePct}
          compareLabel="last period"
          loading={loading}
        />
        <KpiCard
          icon={<PrescriptionIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Prescriptions Issued"
          value={String(stats?.kpis.prescriptionsIssued ?? 0)}
          changePct={stats?.kpis.prescriptionsIssuedChangePct}
          compareLabel="last period"
          loading={loading}
        />
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Follow-ups Scheduled"
          value={String(stats?.kpis.followUpsScheduled ?? 0)}
          changePct={stats?.kpis.followUpsScheduledChangePct}
          compareLabel="last period"
          loading={loading}
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Avg. Consultation Time"
          value={formatDuration(stats?.kpis.avgConsultationSeconds ?? 0)}
          changePct={stats?.kpis.avgConsultationSecondsChangePct}
          compareLabel="last period"
          loading={loading}
        />
      </div>

      <div className="rpt-chart-row">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Consultations Over Time</h3>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && stats && <LineChart series={stats.consultationsTrend} />}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Appointments by Status</h3>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && stats && <DonutChart data={stats.appointmentOutcomes} />}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Patient Demographics</h3>
            <span className="card-subtitle">Age group</span>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && stats && <BarChart data={stats.patientDemographics} />}
        </div>
      </div>

      <div className="dash-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top Diagnoses</h3>
            <Link className="card-link" to="/reports/my?report=diagnoses">
              View All
            </Link>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && stats && stats.topDiagnoses.length === 0 && <div className="card-empty">No diagnoses recorded in this range.</div>}
          {!loading && stats && stats.topDiagnoses.length > 0 && (
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Diagnosis</th>
                  <th>Consultations</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.topDiagnoses.slice(0, 5).map((d, i) => (
                  <tr key={d.diagnosis}>
                    <td className="pat-muted">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{d.diagnosis}</td>
                    <td className="pat-muted">{d.count}</td>
                    <td>
                      <div className="rpt-share-cell">
                        <div className="rpt-share-track">
                          <div className="rpt-share-fill" style={{ width: `${d.percentage}%` }} />
                        </div>
                        <span>{d.percentage}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <Link className="card-link" to="/reports/my?report=diagnoses">
              View Full Diagnosis Report →
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Clinical Activity Summary</h3>
          </div>
          {loading && <div className="card-empty">Loading…</div>}
          {!loading && (
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>This Period</th>
                  <th>Last Period</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {activityRows.map((row) => (
                  <tr key={row.label}>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    <td>{row.current}</td>
                    <td className="pat-muted">{row.prior}</td>
                    <td>
                      {row.pct === null ? (
                        <span className="pat-muted">—</span>
                      ) : (
                        <span style={{ color: row.pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: 12.5 }}>
                          {row.pct >= 0 ? '↑' : '↓'} {Math.abs(row.pct).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ textAlign: 'right', marginTop: 10 }}>
            <Link className="card-link" to="/reports/my?report=consultations">
              View Full Activity Report →
            </Link>
          </div>
        </div>
      </div>

      <p className="pat-muted" style={{ textAlign: 'center', fontSize: 12, marginTop: 4 }}>
        Figures reflect your own consultations, prescriptions and appointments for the selected period.
      </p>
    </div>
  );
};

export default ClinicalStatistics;
