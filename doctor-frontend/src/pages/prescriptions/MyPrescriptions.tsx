import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPrescriptions, getPrescriptionStats, getPrescriptionDetail, downloadPrescriptionPdf } from '../../lib/prescriptions';
import type { PrescriptionSummary } from '../../lib/prescriptions';
import { calculateAge } from '../../lib/queue';
import {
  ClipboardIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  SearchIcon,
  RefreshIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  PrintIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import './prescriptions.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const STATUS_BADGE: Record<string, string> = { Pending: 'badge-gray', Preparing: 'badge-amber', Dispensed: 'badge-blue', Collected: 'badge-green' };

type Tab = 'all' | 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Prescriptions' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'Dispensed', label: 'Dispensed' },
  { key: 'Collected', label: 'Collected' },
];

// Real "partially dispensed" signal — some but not all items already have a batch/dispensed_at,
// while the header status is still Preparing (there's no separate "Partially Dispensed" status).
const dispensedProgress = (items: { dispensedAt: string | null }[]) => {
  const done = items.filter((i) => i.dispensedAt).length;
  return { done, total: items.length };
};

const lastDispensedAt = (items: { dispensedAt: string | null }[]) => {
  const times = items.map((i) => i.dispensedAt).filter((t): t is string => !!t);
  if (times.length === 0) return null;
  return times.reduce((max, t) => (new Date(t) > new Date(max) ? t : max));
};

const exportCsv = (rows: PrescriptionSummary[]) => {
  const header = ['Prescription ID', 'Patient', 'MRN', 'Issued', 'Status', 'Items'];
  const lines = rows.map((r) =>
    [r.code, r.patientName, r.patientId, formatDateTime(r.issuedAt), r.status, String(r.items.length)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-prescriptions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const MyPrescriptions = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const limit = 8;

  const { data: stats, reload: reloadStats } = useApiData(getPrescriptionStats);
  const { data: result, loading, error, reload: reloadList } = useApiData(
    () =>
      listPrescriptions({
        status: tab === 'all' ? undefined : tab,
        search: appliedSearch || undefined,
        from: dateFrom || undefined,
        to: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
        page,
        limit,
      }),
    [tab, appliedSearch, dateFrom, dateTo, page]
  );

  const refreshAll = () => {
    reloadStats();
    reloadList();
  };

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

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

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await listPrescriptions({ status: tab === 'all' ? undefined : tab, search: appliedSearch || undefined, limit: 500 });
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

  const pct = (n: number) => (stats && stats.total > 0 ? `${Math.round((n / stats.total) * 100)}%` : '—');

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>My Prescriptions</h1>
          <p>View, manage and track all prescriptions you have created.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={refreshAll}>
            <RefreshIcon /> Refresh
          </button>
          <button className="pat-btn" disabled={exporting || rows.length === 0} onClick={handleExport}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load prescriptions: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<ClipboardIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Prescriptions" value={String(stats?.total ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All Time</span>} />
        <KpiCard icon={<CalendarIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="This Month" value={String(stats?.thisMonth ?? '—')} loading={!stats} changePct={stats?.thisMonthDeltaPct} compareLabel="last month" />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Dispensed" value={String(stats?.dispensed ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.dispensed) : ''}</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Pending" value={String(stats ? stats.pending + stats.preparing : '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.pending + stats.preparing) : ''}</span>} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Collected" value={String(stats?.collected ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.collected) : ''}</span>} />
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
          <input placeholder="Search patient name or MRN…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
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
                  <th>Prescription</th>
                  <th>Patient</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th>Items</th>
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
                      <div className="pat-empty">No prescriptions match this filter.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r, i) => {
                    const progress = dispensedProgress(r.items);
                    const dispensedAt = lastDispensedAt(r.items);
                    return (
                      <tr key={r.prescriptionId} style={selectedId === r.prescriptionId ? { background: '#f8fafc' } : undefined}>
                        <td className="pat-muted">{((pagination?.page ?? 1) - 1) * limit + i + 1}</td>
                        <td>
                          <span className="q-token">{r.code}</span>
                          {r.isRefill && (
                            <div className="pat-muted" style={{ fontSize: 11, marginTop: 3 }}>
                              Refill
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="pat-name-cell">
                            {r.patientPhotoUrl ? <img className="pat-avatar" src={fileUrl(r.patientPhotoUrl)} alt="" /> : <div className="pat-avatar">{initials(r.patientName)}</div>}
                            <div>
                              <div className="pat-name">{r.patientName}</div>
                              <span className="pat-muted" style={{ fontSize: 11.5 }}>
                                {r.patientId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>{formatDate(r.issuedAt)}</div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            {formatTime(r.issuedAt)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                          {r.status === 'Preparing' && progress.done > 0 && (
                            <div className="pat-muted" style={{ fontSize: 11, marginTop: 3 }}>
                              {progress.done} of {progress.total} dispensed
                            </div>
                          )}
                          {(r.status === 'Dispensed' || r.status === 'Collected') && dispensedAt && (
                            <div className="pat-muted" style={{ fontSize: 11, marginTop: 3 }}>
                              {formatDateTime(dispensedAt)}
                            </div>
                          )}
                        </td>
                        <td className="pat-muted">{r.items.length}</td>
                        <td>
                          <div className="pat-actions-cell">
                            <button className="pat-icon-btn" title="View details" onClick={() => setSelectedId(r.prescriptionId)}>
                              <EyeIcon />
                            </button>
                            <button className="pat-icon-btn" onClick={() => setMenuOpenId(menuOpenId === r.prescriptionId ? null : r.prescriptionId)}>
                              <MoreVerticalIcon />
                              {menuOpenId === r.prescriptionId && (
                                <div className="pat-menu" onMouseLeave={() => setMenuOpenId(null)}>
                                  <button onClick={() => navigate(`/consultations/workspace/${r.appointmentId}`)}>Open in Workspace</button>
                                  <button onClick={() => downloadPrescriptionPdf(r.prescriptionId, r.code)}>Download PDF</button>
                                </div>
                              )}
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
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} prescriptions
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

        {selectedId && <DetailPanel prescriptionId={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
};

const DetailPanel = ({ prescriptionId, onClose }: { prescriptionId: number; onClose: () => void }) => {
  const navigate = useNavigate();
  const { data: rx, loading } = useApiData(() => getPrescriptionDetail(prescriptionId), [prescriptionId]);

  if (loading || !rx) {
    return (
      <div className="card">
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  const { patient, doctor, scheduled_at, appointment_id } = rx.consultation.appointment;
  const code = `RX${String(rx.prescription_id).padStart(6, '0')}`;
  const visitType = rx.priorVisitCount > 0 ? 'Return Visit' : 'New Visit';
  const dispensedAt = lastDispensedAt(rx.items.map((i) => ({ dispensedAt: i.dispensed_at })));

  return (
    <div className="card">
      <div className="cd-panel-header">
        <h3 className="card-title">Prescription Details</h3>
        <button className="cd-close-btn" onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="q-token next">{code}</span>
        <span className={`badge ${STATUS_BADGE[rx.status]}`}>{rx.status}</span>
      </div>

      <div className="cd-patient-row">
        <div style={{ display: 'flex', gap: 10 }}>
          {patient.photo_url ? <img className="pat-avatar" src={fileUrl(patient.photo_url)} alt="" /> : <div className="pat-avatar">{initials(patient.full_name)}</div>}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{patient.full_name}</div>
            <div className="pat-muted" style={{ fontSize: 11.5 }}>
              MRN: {patient.patient_id}
            </div>
          </div>
        </div>
        <div className="cd-patient-meta">
          <div>
            {calculateAge(patient.dob)} Y / {patient.gender}
          </div>
          {patient.phone && <div>{patient.phone}</div>}
        </div>
      </div>

      <div className="cd-meta-grid">
        <div className="cd-meta-field">
          <span className="cd-meta-label">Visit Date &amp; Time</span>
          <span className="cd-meta-value">{formatDateTime(scheduled_at)}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Visit Type</span>
          <span className="cd-meta-value">{visitType}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Attending Doctor</span>
          <span className="cd-meta-value">Dr. {doctor.username}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Prescription Date</span>
          <span className="cd-meta-value">{formatDateTime(rx.issued_at)}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Pharmacy Status</span>
          <span className="cd-meta-value">
            {rx.status}
            {dispensedAt && (
              <>
                <br />
                <span className="pat-muted" style={{ fontSize: 11 }}>
                  {formatDateTime(dispensedAt)}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Total Items</span>
          <span className="cd-meta-value">{rx.items.length}</span>
        </div>
      </div>

      <div className="cd-meta-label" style={{ marginBottom: 8 }}>
        Medicines
      </div>
      {rx.items.map((i) => (
        <div className="cons-rx-row" key={i.rx_item_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{i.medicine.name}</span>
            <span className={`badge ${i.dispensed_at ? 'badge-green' : 'badge-gray'}`}>{i.dispensed_at ? 'Dispensed' : 'Awaiting'}</span>
          </div>
          <span className="pat-muted" style={{ fontSize: 11.5 }}>
            {[i.dosage, i.frequency, i.duration, i.route].filter(Boolean).join(' · ')} — Qty {i.qty}
          </span>
          {i.instructions && (
            <span className="pat-muted" style={{ fontSize: 11.5 }}>
              {i.instructions}
            </span>
          )}
        </div>
      ))}

      {rx.notes && (
        <div className="cd-summary-box blue" style={{ marginTop: 12 }}>
          <div className="cd-summary-box-label">Notes to Pharmacist</div>
          <div>{rx.notes}</div>
        </div>
      )}

      <div className="cd-footer">
        <button className="cons-btn" onClick={() => downloadPrescriptionPdf(rx.prescription_id, code)}>
          <PrintIcon /> Print Prescription
        </button>
        <button className="cons-btn primary" onClick={() => navigate(`/consultations/workspace/${appointment_id}`)}>
          Open in Workspace →
        </button>
      </div>
    </div>
  );
};

export default MyPrescriptions;
