import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getSkipStats, listAppointments, updateAppointmentStatus, tokenNumber, calculateAge, waitingMinutes } from '../../lib/queue';
import { PatientsIcon, ClockIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import './queue.css';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return toDateInput(d);
};
const defaultTo = () => toDateInput(new Date());

const PER_PAGE_OPTIONS = [10, 25, 50];

const SkipRecall = () => {
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: stats, reload: reloadStats } = useApiData(() => getSkipStats({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const {
    data: result,
    loading,
    error,
    reload: reloadList,
  } = useApiData(
    () => listAppointments({ status: 'Skipped', dateFrom, dateTo, search: appliedSearch || undefined, page, limit }),
    [dateFrom, dateTo, appliedSearch, page, limit]
  );

  const refreshAll = () => {
    reloadStats();
    reloadList();
  };

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };

  const resetFilters = () => {
    setDateFrom(defaultFrom());
    setDateTo(defaultTo());
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  const runRecall = async (id: number) => {
    setBusyId(id);
    try {
      await updateAppointmentStatus(id, 'Waiting');
      refreshAll();
    } finally {
      setBusyId(null);
    }
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

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Skip / Recall</h1>
          <p>Manage skipped patients and recall them back into the queue.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dash-date-chip">
            {dateLabel} · {timeLabel}
          </div>
          <button className="pat-btn" onClick={refreshAll}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load skipped patients: {error}</div>}

      <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Skipped (in range)" value={String(stats?.totalSkipped ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Skipped Today" value={String(stats?.skippedToday ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Skipped &gt; 30 min" value={String(stats?.skippedOver30 ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Longest Skipped Wait" value={`${stats?.longestSkippedWaitMinutes ?? 0} min`} loading={!stats} />
      </div>

      <div className="pat-filter-bar">
        <div className="q-filter-field">
          <span className="q-filter-label">From Date</span>
          <input type="date" className="q-filter-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="q-filter-field">
          <span className="q-filter-label">To Date</span>
          <input type="date" className="q-filter-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="pat-search">
          <PatientsIcon />
          <input placeholder="Search by patient name, token no…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
        </div>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
        <button className="pat-btn primary" onClick={applyFilters}>
          Filter
        </button>
      </div>

      <div className="pat-table-card">
        <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Skip / Recall List</h3>
        </div>
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Token No.</th>
                <th>Patient Name</th>
                <th>Age / Gender</th>
                <th>Skipped Time</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                ))}
              {!loading && (result?.data.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="pat-empty">No skipped patients in this range.</div>
                  </td>
                </tr>
              )}
              {!loading &&
                result?.data.map((a, i) => {
                  const skippedIso = a.skipped_at ?? a.scheduled_at;
                  return (
                    <tr key={a.appointment_id}>
                      <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? limit) + i + 1}</td>
                      <td>
                        <span className="q-token">{tokenNumber(a.appointment_id)}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.patient.full_name}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {a.patient.patient_id}
                        </span>
                      </td>
                      <td>
                        <span className={`q-gender-dot ${a.patient.gender === 'Female' ? 'female' : 'male'}`} />
                        {calculateAge(a.patient.dob)} Y / {a.patient.gender}
                      </td>
                      <td>
                        <div>{formatTime(skippedIso)}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {formatDate(skippedIso)}
                        </span>
                      </td>
                      <td className="pat-muted">{a.skip_reason || '—'}</td>
                      <td>
                        <span className="badge badge-red">Skipped</span>
                      </td>
                      <td>
                        <button
                          className="pat-btn primary"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          disabled={busyId === a.appointment_id}
                          onClick={() => runRecall(a.appointment_id)}
                        >
                          <RefreshIcon /> Recall
                        </button>
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
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}{' '}
              records
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

            <select className="pat-select" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkipRecall;
