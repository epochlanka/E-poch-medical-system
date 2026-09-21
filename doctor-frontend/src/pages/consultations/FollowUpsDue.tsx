import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { getFollowUpsList } from '../../lib/dashboard';
import type { FollowUpRow } from '../../lib/dashboard';
import { calculateAge } from '../../lib/queue';
import {
  ClipboardIcon,
  ClockIcon,
  CalendarIcon,
  DownloadIcon,
  PrintIcon,
  EyeIcon,
  SearchIcon,
  RefreshIcon,
  PhoneIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import './consultation.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const dayDiff = (target: string) => Math.round((startOfDay(new Date(target)).getTime() - startOfDay(new Date()).getTime()) / 86400000);

const rowStatus = (followUpDate: string) => {
  const diff = dayDiff(followUpDate);
  if (diff < 0) return { label: 'Overdue', cls: 'badge-red', sub: `${-diff} day${-diff === 1 ? '' : 's'} overdue` };
  if (diff === 0) return { label: 'Due Today', cls: 'badge-amber', sub: 'Today' };
  if (diff === 1) return { label: 'Due Tomorrow', cls: 'badge-blue', sub: 'Tomorrow' };
  return { label: 'Upcoming', cls: 'badge-gray', sub: `in ${diff} days` };
};

type Bucket = 'all' | 'overdue' | 'today' | 'week' | 'month';
const TABS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due Today' },
  { key: 'week', label: 'Due This Week' },
  { key: 'month', label: 'Due This Month' },
];

const exportCsv = (rows: FollowUpRow[]) => {
  const header = ['Patient', 'MRN', 'Last Visit', 'Follow-up Date', 'Reason / Diagnosis', 'Doctor'];
  const lines = rows.map((r) =>
    [r.patient.full_name, r.patient.patient_id, formatDate(r.lastVisitDate), formatDate(r.followUpDate), r.diagnosis ?? r.complaint ?? '', r.doctorName]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `follow-ups-due-${startOfDay(new Date()).toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const FollowUpsDue = () => {
  const navigate = useNavigate();
  const [bucket, setBucket] = useState<Bucket>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const limit = 7;

  const { data: result, loading, error, reload } = useApiData(
    () => getFollowUpsList({ bucket, search: appliedSearch || undefined, page, limit }),
    [bucket, appliedSearch, page]
  );

  const rows = result?.data ?? [];
  const counts = result?.counts;
  const pagination = result?.pagination;
  const selected = rows.find((r) => r.consultationId === selectedId) ?? null;

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };
  const resetFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await getFollowUpsList({ bucket, search: appliedSearch || undefined, limit: 500 });
      exportCsv(full.data);
    } finally {
      setExporting(false);
    }
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((x) => x >= 1 && x <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  const priorityRows = counts
    ? [
        { label: 'Overdue', count: counts.overdue, color: '#dc2626' },
        { label: 'Due Today', count: counts.dueToday, color: '#b45309' },
        { label: 'Due This Week', count: counts.dueThisWeek, color: '#2563eb' },
        { label: 'Due This Month', count: counts.dueThisMonth, color: '#16a34a' },
      ]
    : [];

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Follow-ups Due</h1>
          <p>Patients who need follow-up consultations based on recommended dates.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dash-date-chip">
            {dateLabel} · {timeLabel}
          </div>
          <button className="pat-btn" onClick={reload}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load follow-ups: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<ClipboardIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Total Follow-ups Due" value={String(counts?.total ?? '—')} loading={!counts} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<CalendarIcon />} iconBg="#fee2e2" iconColor="#dc2626" label="Overdue" value={String(counts?.overdue ?? '—')} loading={!counts} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<CalendarIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Due Today" value={String(counts?.dueToday ?? '—')} loading={!counts} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Due This Week" value={String(counts?.dueThisWeek ?? '—')} loading={!counts} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<CalendarIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Due This Month" value={String(counts?.dueThisMonth ?? '—')} loading={!counts} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
      </div>

      <div className="q-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`q-tab${bucket === t.key ? ' active' : ''}`} onClick={() => { setBucket(t.key); setPage(1); setSelectedId(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search patient name or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
        </div>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
        <button className="pat-btn primary" onClick={applyFilters}>
          Filter
        </button>
      </div>

      <div className="q-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>Age / Gender</th>
                  <th>Last Visit</th>
                  <th>Follow-up Date</th>
                  <th>Reason / Diagnosis</th>
                  <th>Status</th>
                  <th>Doctor</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="pat-empty">No follow-ups due in this range.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r, i) => {
                    const status = rowStatus(r.followUpDate);
                    return (
                      <tr key={r.consultationId} style={selectedId === r.consultationId ? { background: '#f8fafc' } : undefined}>
                        <td className="pat-muted">{((pagination?.page ?? 1) - 1) * limit + i + 1}</td>
                        <td>
                          <div className="pat-name-cell">
                            {r.patient.photo_url ? (
                              <img className="pat-avatar" src={fileUrl(r.patient.photo_url)} alt="" />
                            ) : (
                              <div className="pat-avatar">{initials(r.patient.full_name)}</div>
                            )}
                            <div>
                              <div className="pat-name">{r.patient.full_name}</div>
                              <span className="pat-muted" style={{ fontSize: 11.5 }}>
                                {r.patient.patient_id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`q-gender-dot ${r.patient.gender === 'Female' ? 'female' : 'male'}`} />
                          {calculateAge(r.patient.dob)} Y / {r.patient.gender}
                        </td>
                        <td>
                          <div>{formatDate(r.lastVisitDate)}</div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            {formatTime(r.lastVisitDate)}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: status.cls === 'badge-red' ? '#dc2626' : status.cls === 'badge-amber' ? '#b45309' : '#0f172a' }}>
                            {formatDate(r.followUpDate)}
                          </div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            ({status.sub})
                          </span>
                        </td>
                        <td className="pat-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.diagnosis || r.complaint || '—'}
                        </td>
                        <td>
                          <span className={`badge ${status.cls}`}>{status.label}</span>
                        </td>
                        <td className="pat-muted">Dr. {r.doctorName}</td>
                        <td>
                          <div className="pat-actions-cell">
                            <button className="pat-icon-btn" title="View in Workspace" onClick={() => navigate(`/consultations/workspace/${r.appointmentId}`)}>
                              <EyeIcon />
                            </button>
                            <button
                              className="pat-icon-btn"
                              title="Select patient"
                              style={selectedId === r.consultationId ? { borderColor: '#2563eb', color: '#2563eb' } : undefined}
                              onClick={() => setSelectedId(selectedId === r.consultationId ? null : r.consultationId)}
                            >
                              <CalendarIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} follow-ups
              </div>
              <div className="pat-pagination-pages">
                <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>
                  <ChevronLeftIcon />
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                      <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => setPage(p)}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Follow-up Priority</h3>
            </div>
            {!counts && <div className="card-empty">Loading…</div>}
            {counts &&
              priorityRows.map((p) => (
                <div className="med-row" key={p.label}>
                  <div className="med-info">
                    <div className="med-name">{p.label}</div>
                    <div className="med-bar-track">
                      <div
                        className="med-bar-fill"
                        style={{ width: `${counts.total ? Math.round((p.count / counts.total) * 100) : 0}%`, background: p.color }}
                      />
                    </div>
                  </div>
                  <div className="med-count">{p.count}</div>
                </div>
              ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="q-controls">
              {selected?.patient.phone ? (
                <a className="q-control-btn primary" href={`tel:${selected.patient.phone}`} style={{ textDecoration: 'none' }}>
                  <PhoneIcon /> Call {selected.patient.full_name.split(' ')[0]}
                </a>
              ) : (
                <button className="q-control-btn primary" disabled title="Select a patient row first">
                  <PhoneIcon /> Call Selected Patient
                </button>
              )}
              <button className="q-control-btn" onClick={() => window.print()}>
                <PrintIcon /> Print Follow-up List
              </button>
              <button className="q-control-btn" disabled={exporting || rows.length === 0} onClick={handleExport}>
                <DownloadIcon /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FollowUpsDue;
