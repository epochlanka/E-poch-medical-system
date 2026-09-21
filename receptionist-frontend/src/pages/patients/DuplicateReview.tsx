import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listDuplicateFlags, getDuplicateStats, dismissDuplicateFlag } from '../../lib/duplicates';
import type { DuplicateFlag, ListDuplicateFlagsParams, MatchField } from '../../lib/duplicates';
import { UsersIcon, ClockIcon, CheckCircleIcon, XCircleIcon, SearchIcon, FilterIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, AlertIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import DuplicateFlagModal from './DuplicateFlagModal';
import { initials, formatDate } from './patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import './duplicateReview.css';

const PER_PAGE_OPTIONS = [5, 10, 20, 50];

const DATE_PRESETS = [
  { value: '', label: 'Date Added: All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

const MATCH_ROWS: { key: 'dob' | 'nic' | 'phone' | 'address'; label: string }[] = [
  { key: 'dob', label: 'DOB' },
  { key: 'nic', label: 'NIC' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
];

const fieldRowClass = (f: MatchField) => (f.status === 'exact' ? 'exact' : f.status === 'similar' ? 'similar' : '');

const dateRangeFor = (preset: string): { dateFrom?: string; dateTo?: string } => {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === 'week') {
    const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === 'month') {
    const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  return {};
};

const PatientMini = ({ patient }: { patient: DuplicateFlag['patient'] }) => (
  <div className="dup-patient-mini">
    {patient.photo_url ? (
      <img className="pat-avatar" src={fileUrl(patient.photo_url)} alt="" />
    ) : (
      <div className="pat-avatar">{initials(patient.full_name)}</div>
    )}
    <div className="dup-patient-mini-text">
      <span className="pat-id-link" style={{ fontSize: 11.5 }}>
        {patient.patient_id}
      </span>
      <span className="dup-patient-mini-name">
        {patient.full_name}
        {!patient.is_active && <span className="dup-inactive-badge">INACTIVE</span>}
      </span>
      <span className="dup-patient-mini-detail">{patient.nic || '—'}</span>
      <span className="dup-patient-mini-detail">{patient.phone || '—'}</span>
    </div>
  </div>
);

const DuplicateReview = () => {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListDuplicateFlagsParams>({ status: 'Pending', page: 1, limit: 5 });
  const [datePreset, setDatePreset] = useState('');
  const [modalFlag, setModalFlag] = useState<{ flag: DuplicateFlag; mode: 'merge' | 'view' } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getDuplicateStats);
  const { data: result, loading, error, reload } = useApiData(() => listDuplicateFlags(filters), [JSON.stringify(filters)]);

  const flags = result?.data ?? [];
  const pagination = result?.pagination;
  const reviewedByOptions = result?.reviewedByOptions ?? [];

  const setFilter = (patch: Partial<ListDuplicateFlagsParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const resetFilters = () => {
    setSearchInput('');
    setDatePreset('');
    setFilters({ status: 'Pending', page: 1, limit: filters.limit });
  };

  const refreshAll = () => {
    reload();
    reloadStats();
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  return (
    <div>
      <div className="pat-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div className="reg-card-icon" style={{ background: '#dbeafe', color: '#2563eb', marginTop: 2 }}>
            <AlertIcon />
          </div>
          <div>
            <h1>Duplicate Review</h1>
            <p>Review possible duplicate patient records and take appropriate action.</p>
          </div>
        </div>
        <div className="reg-breadcrumb">
          <Link to="/patients/all" style={{ color: '#2563eb', textDecoration: 'none' }}>
            Patients
          </Link>
          <span className="sep">/</span>
          <span className="current">Duplicate Review</span>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load duplicate flags: {error}</div>}

      <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard
          icon={<UsersIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Pending Review"
          value={String(stats?.pendingReview ?? 0)}
          loading={statsLoading}
          footer={
            <button className="kpi-view-all" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setFilter({ status: 'Pending' })}>
              Records to review · View all
            </button>
          }
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Reviewed Today"
          value={String(stats?.reviewedToday ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Records reviewed</span>}
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Merged Today"
          value={String(stats?.mergedToday ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Records merged</span>}
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Dismissed Today"
          value={String(stats?.dismissedToday ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Marked as not duplicate</span>}
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={filters.matchBand ?? ''} onChange={(e) => setFilter({ matchBand: (e.target.value || undefined) as any })}>
          <option value="">Match Score: All</option>
          <option value="very-high">Very High (95%+)</option>
          <option value="high">High (80-94%)</option>
          <option value="moderate">Moderate (61-79%)</option>
          <option value="low">Low (&lt;61%)</option>
        </select>

        <select className="pat-select" value={filters.status ?? 'Pending'} onChange={(e) => setFilter({ status: e.target.value as any })}>
          <option value="Pending">Status: Pending Review</option>
          <option value="Merged">Merged</option>
          <option value="Dismissed">Dismissed</option>
          <option value="All">All</option>
        </select>

        <select
          className="pat-select"
          value={datePreset}
          onChange={(e) => {
            setDatePreset(e.target.value);
            setFilter(dateRangeFor(e.target.value));
          }}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <select className="pat-select" value={filters.reviewedBy ?? ''} onChange={(e) => setFilter({ reviewedBy: e.target.value || undefined })}>
          <option value="">Reviewed By: All</option>
          {reviewedByOptions.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>

        <button className="pat-btn" onClick={refreshAll}>
          <FilterIcon /> Filters
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="pat-pagination-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span>Showing 1 to {Math.min(pagination.limit, pagination.total)} of {pagination.total} possible duplicate groups</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Rows per page:
            <select className="pat-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Match Score</th>
                <th>Patient Records Compared</th>
                <th>Key Matching Information</th>
                <th>Date Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="pat-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && flags.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="pat-empty">No duplicate flags match these filters.</div>
                  </td>
                </tr>
              )}
              {!loading &&
                flags.map((flag) => (
                  <tr key={flag.flagId}>
                    <td>
                      <div className={`dup-score-box ${flag.matchBand}`}>
                        <div className="dup-score-pct">{flag.matchScorePct}%</div>
                        <div className="dup-score-label">{flag.matchLabel}</div>
                      </div>
                    </td>
                    <td>
                      <div className="dup-compare">
                        <PatientMini patient={flag.patient} />
                        <span className="dup-vs">VS</span>
                        <PatientMini patient={flag.matchedPatient} />
                      </div>
                    </td>
                    <td>
                      <div className="dup-match-info">
                        {MATCH_ROWS.map((row) => {
                          const f = flag.breakdown[row.key];
                          return (
                            <div key={row.key} className={`dup-match-row ${fieldRowClass(f)}`}>
                              <span className="dup-match-label">{row.label}:</span>
                              <span>{f.detail}</span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <div className="dup-date-cell">{formatDate(flag.createdAt)}</div>
                      <div className="dup-added-by">Added by: {flag.addedBy}</div>
                      {flag.status !== 'Pending' && (
                        <div className="dup-added-by">
                          {flag.status} {flag.reviewedBy ? `by ${flag.reviewedBy}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="dup-actions">
                        {flag.status === 'Pending' ? (
                          <>
                            <button className="dup-action-btn primary" onClick={() => setModalFlag({ flag, mode: 'merge' })}>
                              Review & Merge
                            </button>
                            <button
                              className="dup-action-btn warn"
                              onClick={async () => {
                                await dismissDuplicateFlag(flag.flagId);
                                refreshAll();
                              }}
                            >
                              Not a Duplicate
                            </button>
                          </>
                        ) : null}
                        <button className="dup-action-btn info" onClick={() => setModalFlag({ flag, mode: 'view' })}>
                          View Details
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
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} possible duplicate groups
            </div>
            <div className="pat-pagination-pages">
              <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                <ChevronLeftIcon />
              </button>
              {pageNumbers.map((p, i) => {
                const prev = pageNumbers[i - 1];
                const showEllipsis = prev !== undefined && p - prev > 1;
                return (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                    <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => goToPage(p)}>
                      {p}
                    </button>
                  </span>
                );
              })}
              <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
                <ChevronRightIcon />
              </button>
            </div>
            <select className="pat-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {modalFlag && (
        <DuplicateFlagModal
          flag={modalFlag.flag}
          mode={modalFlag.mode}
          onClose={() => setModalFlag(null)}
          onResolved={() => {
            setModalFlag(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default DuplicateReview;
