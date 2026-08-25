import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listConsultations, getConsultationContext, displayPatient } from '../../lib/consultations';
import type { ConsultationSummary } from '../../lib/consultations';
import { getFollowUps } from '../../lib/dashboard';
import { calculateAge } from '../../lib/queue';
import {
  ClipboardIcon,
  ClockIcon,
  CalendarIcon,
  DownloadIcon,
  EyeIcon,
  SearchIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  RefreshIcon,
  PrintIcon,
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

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const deltaPct = (count: number, prev: number) => (prev === 0 ? null : Math.round(((count - prev) / prev) * 100));

interface KpiState {
  allTime: number;
  today: number;
  thisMonth: number;
  thisMonthDelta: number | null;
  thisWeek: number;
  thisWeekDelta: number | null;
  followUpsDue: number;
}

const useKpis = (reloadKey: number) => {
  const [kpis, setKpis] = useState<KpiState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const weekStart = startOfWeek(now);
    const prevWeekStart = addDays(weekStart, -7);
    const prevWeekEnd = endOfDay(addDays(weekStart, -1));

    const count = (from?: Date, to?: Date) =>
      listConsultations({ from: from?.toISOString(), to: to?.toISOString(), limit: 1 }).then((r) => r.pagination.total);

    Promise.all([
      count(),
      count(startOfDay(now), endOfDay(now)),
      count(monthStart, endOfDay(now)),
      count(startOfMonth(prevMonthDate), endOfMonth(prevMonthDate)),
      count(weekStart, endOfDay(now)),
      count(prevWeekStart, prevWeekEnd),
      getFollowUps().then((f) => f.length),
    ]).then(([allTime, today, thisMonth, prevMonth, thisWeek, prevWeek, followUpsDue]) => {
      if (cancelled) return;
      setKpis({
        allTime,
        today,
        thisMonth,
        thisMonthDelta: deltaPct(thisMonth, prevMonth),
        thisWeek,
        thisWeekDelta: deltaPct(thisWeek, prevWeek),
        followUpsDue,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  return kpis;
};

type Tab = 'all' | 'completed' | 'inprogress' | 'followups';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Consultations' },
  { key: 'completed', label: 'Completed' },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'followups', label: 'Follow-ups' },
];

const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const exportCsv = (rows: ConsultationSummary[]) => {
  const header = ['Date', 'Patient', 'MRN', 'Status', 'Reason for Visit', 'Diagnosis'];
  const lines = rows.map((r) =>
    [formatDateTime(r.createdAt), r.patientName, r.patientId, r.status, r.complaint ?? '', r.diagnosis ?? '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consultations-${toDateInput(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const STATUS_BADGE: Record<string, string> = { Finalized: 'badge-green', Draft: 'badge-amber' };
const STATUS_LABEL: Record<string, string> = { Finalized: 'Completed', Draft: 'In Progress' };

const MyConsultations = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const limit = 8;
  const kpis = useKpis(reloadKey);

  const tabParams = tab === 'completed' ? { status: 'Finalized' as const } : tab === 'inprogress' ? { status: 'Draft' as const } : tab === 'followups' ? { followUpOnly: true } : {};

  const { data: result, loading, error, reload } = useApiData(
    () =>
      listConsultations({
        ...tabParams,
        search: appliedSearch || undefined,
        from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        to: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
        page,
        limit,
      }),
    [tab, appliedSearch, dateFrom, dateTo, page]
  );

  const refreshAll = () => {
    reload();
    setReloadKey((k) => k + 1);
  };

  const rows = useMemo(() => {
    const data = result?.data ?? [];
    return sortAsc ? [...data].reverse() : data;
  }, [result, sortAsc]);

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };
  const resetFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const pagination = result?.pagination;
  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((x) => x >= 1 && x <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>My Consultations</h1>
          <p>View and manage your consultation records.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={refreshAll}>
            <RefreshIcon /> Refresh
          </button>
          <button className="pat-btn" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
            <DownloadIcon /> Export CSV
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load consultations: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<ClipboardIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Consultations" value={String(kpis?.allTime ?? '—')} loading={!kpis} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All Time</span>} />
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="This Month"
          value={String(kpis?.thisMonth ?? '—')}
          loading={!kpis}
          changePct={kpis?.thisMonthDelta}
          compareLabel="last month"
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="This Week"
          value={String(kpis?.thisWeek ?? '—')}
          loading={!kpis}
          changePct={kpis?.thisWeekDelta}
          compareLabel="last week"
        />
        <KpiCard icon={<ClockIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Today" value={String(kpis?.today ?? '—')} loading={!kpis} />
        <KpiCard
          icon={<ClipboardIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Follow-ups Due"
          value={String(kpis?.followUpsDue ?? '—')}
          loading={!kpis}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>}
        />
      </div>

      <div className="q-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`q-tab${tab === t.key ? ' active' : ''}`} onClick={() => { setTab(t.key); setPage(1); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by patient name or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
        </div>
        <div className="q-filter-field">
          <span className="q-filter-label">From</span>
          <input type="date" className="q-filter-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="q-filter-field">
          <span className="q-filter-label">To</span>
          <input type="date" className="q-filter-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
        <button className="pat-btn primary" onClick={applyFilters}>
          Filter
        </button>
      </div>

      <div className={`myc-layout${selectedId ? ' has-detail' : ''}`}>
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => setSortAsc((v) => !v)}>
                    Date &amp; Time {sortAsc ? '↑' : '↓'}
                  </th>
                  <th>Patient</th>
                  <th>Age / Gender</th>
                  <th>Status</th>
                  <th>Reason for Visit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="pat-empty">No consultations match this filter.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((c, i) => (
                    <tr key={c.consultationId} style={selectedId === c.appointmentId ? { background: '#f8fafc' } : undefined}>
                      <td className="pat-muted">{((pagination?.page ?? 1) - 1) * limit + i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{formatDate(c.createdAt)}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {formatTime(c.createdAt)}
                        </span>
                      </td>
                      <td>
                        <div className="pat-name-cell">
                          {c.patientPhotoUrl ? <img className="pat-avatar" src={fileUrl(c.patientPhotoUrl)} alt="" /> : <div className="pat-avatar">{initials(c.patientName)}</div>}
                          <div>
                            <div className="pat-name">
                              {c.patientName} {c.isTemporary && <span className="badge badge-amber">Temporary</span>}
                            </div>
                            <span className="pat-muted" style={{ fontSize: 11.5 }}>
                              {c.patientId ?? 'Temporary'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`q-gender-dot ${c.patientGender === 'Female' ? 'female' : 'male'}`} />
                        {c.patientDob ? `${calculateAge(c.patientDob)} Y` : '—'} / {c.patientGender ?? '—'}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.complaint || '—'}</td>
                      <td>
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" title="View details" onClick={() => setSelectedId(c.appointmentId)}>
                            <EyeIcon />
                          </button>
                          <button className="pat-icon-btn" onClick={() => setMenuOpenId(menuOpenId === c.appointmentId ? null : c.appointmentId)}>
                            <MoreVerticalIcon />
                            {menuOpenId === c.appointmentId && (
                              <div className="pat-menu" onMouseLeave={() => setMenuOpenId(null)}>
                                <button onClick={() => navigate(`/consultations/workspace/${c.appointmentId}`)}>Open in Workspace</button>
                              </div>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} consultations
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

        {selectedId && <DetailPanel appointmentId={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
};

type DetailTab = 'summary' | 'vitals' | 'diagnosis' | 'prescription' | 'notes' | 'history';
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'vitals', label: 'Vitals' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'prescription', label: 'Prescription' },
  { key: 'notes', label: 'Notes' },
  { key: 'history', label: 'History' },
];

const DetailPanel = ({ appointmentId, onClose }: { appointmentId: number; onClose: () => void }) => {
  const navigate = useNavigate();
  const { data: context, loading } = useApiData(() => getConsultationContext(appointmentId), [appointmentId]);
  const [detailTab, setDetailTab] = useState<DetailTab>('summary');

  if (loading || !context) {
    return (
      <div className="card">
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  const { appointment, consultation, recentConsultations } = context;
  const patient = displayPatient(context);
  const isFinalized = consultation?.status === 'Finalized';
  const visitType = recentConsultations.length > 0 ? 'Return Visit' : 'New Visit';

  return (
    <div className="card">
      <div className="cd-panel-header">
        <h3 className="card-title">Consultation Details</h3>
        <button className="cd-close-btn" onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div className="cd-patient-row">
        <div style={{ display: 'flex', gap: 10 }}>
          {patient.photoUrl ? <img className="pat-avatar" src={fileUrl(patient.photoUrl)} alt="" /> : <div className="pat-avatar">{initials(patient.fullName)}</div>}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
              {patient.fullName} {patient.isTemporary && <span className="badge badge-amber">Temporary</span>}
            </div>
            <div className="pat-muted" style={{ fontSize: 11.5 }}>
              MRN: {patient.patientId ?? 'Temporary'}
            </div>
          </div>
        </div>
        <div className="cd-patient-meta">
          <div>
            {patient.dob ? `${calculateAge(patient.dob)} Y` : patient.approxAge ? `~${patient.approxAge} Y` : '—'} / {patient.gender ?? '—'}
          </div>
          {patient.phone && <div>{patient.phone}</div>}
        </div>
      </div>

      <div className="cd-meta-grid">
        <div className="cd-meta-field">
          <span className="cd-meta-label">Consultation Date &amp; Time</span>
          <span className="cd-meta-value">{formatDateTime(appointment.scheduledAt)}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Visit Type</span>
          <span className="cd-meta-value">
            {visitType} {consultation && <span className={`badge ${isFinalized ? 'badge-green' : 'badge-amber'}`}>{isFinalized ? 'Completed' : 'In Progress'}</span>}
          </span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Consultation ID</span>
          <span className="cd-meta-value">{consultation ? `CONS-${String(consultation.consultation_id).padStart(6, '0')}` : '—'}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Attending Doctor</span>
          <span className="cd-meta-value">Dr. {appointment.doctor.username}</span>
        </div>
      </div>

      <div className="cd-subtabs">
        {DETAIL_TABS.map((t) => (
          <button key={t.key} className={`cd-subtab${detailTab === t.key ? ' active' : ''}`} onClick={() => setDetailTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'summary' && (
        <div>
          <div className="cd-summary-box gray">
            <div className="cd-summary-box-label">Chief Complaint</div>
            <div>{consultation?.complaint || 'Not recorded'}</div>
          </div>
          <div className="cd-summary-box green">
            <div className="cd-summary-box-label">Diagnosis</div>
            <div>
              {consultation?.diagnosis || 'Not recorded'} {consultation?.icd10_code ? `(ICD-10: ${consultation.icd10_code})` : ''}
            </div>
          </div>
          <div className="cd-summary-box blue">
            <div className="cd-summary-box-label">Treatment Summary</div>
            <div>{consultation?.notes || 'Not recorded'}</div>
          </div>
          {consultation?.follow_up_date && (
            <div className="cd-summary-box amber">
              <div className="cd-summary-box-label">Follow-up</div>
              <div>{formatDate(consultation.follow_up_date)}</div>
            </div>
          )}
        </div>
      )}

      {detailTab === 'vitals' && (
        <div className="cons-vital-stat-grid">
          {[
            ['Temperature', consultation?.vitals?.temp, '°C'],
            ['Blood Pressure', consultation?.vitals?.bp_systolic && consultation?.vitals?.bp_diastolic ? `${consultation.vitals.bp_systolic}/${consultation.vitals.bp_diastolic}` : '', 'mmHg'],
            ['Heart Rate', consultation?.vitals?.pulse, 'bpm'],
            ['Respiratory Rate', consultation?.vitals?.respiratory_rate, '/min'],
            ['SpO2', consultation?.vitals?.spo2, '%'],
            ['Weight', consultation?.vitals?.weight, 'kg'],
          ].map(([label, value, unit]) => (
            <div className="cons-vital-stat-box" key={label as string}>
              <div className="cons-vital-stat-label">{label}</div>
              <div className="cons-vital-stat-value">
                {value || '—'}
                {value ? <span className="cons-vital-stat-unit">{unit}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailTab === 'diagnosis' && (
        <div>
          <div className="cd-summary-box green">
            <div className="cd-summary-box-label">Diagnosis</div>
            <div>{consultation?.diagnosis || 'Not recorded'}</div>
          </div>
          <div className="cd-summary-box gray">
            <div className="cd-summary-box-label">ICD-10</div>
            <div>{consultation?.icd10_code || '—'}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="cd-meta-label" style={{ marginBottom: 8 }}>
              Medical History Tags
            </div>
            <div className="cons-chips">
              {(consultation?.medicalHistory ?? []).map((m) => (
                <span className="cons-chip" key={m}>
                  {m}
                </span>
              ))}
              {(consultation?.medicalHistory ?? []).length === 0 && (
                <span className="pat-muted" style={{ fontSize: 12.5 }}>
                  None tagged.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {detailTab === 'prescription' && (
        <div>
          {(consultation?.prescriptions.length ?? 0) === 0 && <div className="pat-empty">No prescriptions for this visit.</div>}
          {consultation?.prescriptions.map((p) => (
            <div className="cons-rx-row" key={p.prescription_id}>
              <span>
                Prescription #{p.prescription_id} {p.is_refill && <span className="badge badge-gray">Refill</span>}
              </span>
              <span className={`badge ${p.status === 'Dispensed' || p.status === 'Collected' ? 'badge-green' : 'badge-amber'}`}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      {detailTab === 'notes' && (
        <div className="cd-summary-box blue">
          <div className="cd-summary-box-label">Consultation Notes</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{consultation?.notes || 'No notes recorded.'}</div>
        </div>
      )}

      {detailTab === 'history' && (
        <div>
          {recentConsultations.length === 0 && <div className="pat-empty">No past consultations.</div>}
          {recentConsultations.map((c, i) => (
            <div className="cons-recent-row" key={i}>
              <span className="cons-recent-diagnosis">{c.diagnosis || 'No diagnosis recorded'}</span>
              <span className="cons-recent-date">{formatDate(c.date)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="cd-footer">
        <button className="cons-btn" onClick={() => window.print()}>
          <PrintIcon /> Print / PDF
        </button>
        <button className="cons-btn primary" onClick={() => navigate(`/consultations/workspace/${appointmentId}`)}>
          View Full Record →
        </button>
      </div>
    </div>
  );
};

export default MyConsultations;
