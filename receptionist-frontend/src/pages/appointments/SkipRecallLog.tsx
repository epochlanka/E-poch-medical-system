import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getDoctors, listQueueLog, displayPatientName, displayPatientId } from '../../lib/appointments';
import type { Doctor, QueueLogEntry, QueueLogParams } from '../../lib/appointments';
import { getClinicSettings } from '../../lib/settings';
import { RefreshIcon, DownloadIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, XCircleIcon } from '../../components/layout/Icons';
import { initials, calculateAge } from '../patients/patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './bookAppointment.css';
import './skipRecallLog.css';

type ActionTab = 'all' | 'Skipped' | 'Recalled';

const TABS: { key: ActionTab; label: string }[] = [
  { key: 'all', label: 'All Logs' },
  { key: 'Skipped', label: 'Skipped' },
  { key: 'Recalled', label: 'Recalled' },
];

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const toCsv = (rows: QueueLogEntry[]) => {
  const header = ['Date & Time', 'Action', 'Patient', 'Patient ID', 'Doctor', 'Reason', 'Action By'];
  const body = rows.map((r) => [
    formatDateTime(r.created_at),
    r.action,
    displayPatientName(r.appointment),
    displayPatientId(r.appointment),
    `Dr. ${r.appointment.doctor.username}`,
    r.reason ?? '',
    `${r.actor.username} (${r.actor.role})`,
  ]);
  return [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
};

const ViewLogModal = ({ entry, onClose }: { entry: QueueLogEntry; onClose: () => void }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
      <div className="modal-title">
        {entry.action} — {displayPatientName(entry.appointment)}
      </div>
      <div className="modal-subtitle">{formatDateTime(entry.created_at)}</div>
      <div className="srl-detail-grid">
        <div className="srl-detail-field">
          <span className="srl-detail-label">Patient ID</span>
          <span className="srl-detail-value">{displayPatientId(entry.appointment)}</span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Age / Gender</span>
          <span className="srl-detail-value">
            {entry.appointment.patient ? `${calculateAge(entry.appointment.patient.dob)} Y | ${entry.appointment.patient.gender}` : entry.appointment.temp_patient_gender ?? '—'}
          </span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Doctor / Consultant</span>
          <span className="srl-detail-value">Dr. {entry.appointment.doctor.username}</span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Visit Type</span>
          <span className="srl-detail-value">
            {entry.appointment.is_walk_in ? 'Walk-in' : entry.appointment.visit_type}
          </span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Consultation Type</span>
          <span className="srl-detail-value">{entry.appointment.consultation_type ?? '—'}</span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Priority</span>
          <span className="srl-detail-value">{entry.appointment.priority}</span>
        </div>
        <div className="srl-detail-field" style={{ gridColumn: 'span 2' }}>
          <span className="srl-detail-label">Reason / Notes</span>
          <span className="srl-detail-value">{entry.reason || 'None recorded'}</span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Action By</span>
          <span className="srl-detail-value">
            {entry.actor.username} ({entry.actor.role})
          </span>
        </div>
        <div className="srl-detail-field">
          <span className="srl-detail-label">Appointment</span>
          <span className="srl-detail-value">#{entry.appointment_id}</span>
        </div>
      </div>
      <div className="modal-actions">
        <button className="modal-btn secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  </div>
);

const SkipRecallLog = () => {
  const [tab, setTab] = useState<ActionTab>('all');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(3));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));
  const [doctorFilter, setDoctorFilter] = useState<Doctor | null>(null);
  const [doctorFilterOpen, setDoctorFilterOpen] = useState(false);
  const [doctorFilterSearch, setDoctorFilterSearch] = useState('');
  const [doctorFilterResults, setDoctorFilterResults] = useState<Doctor[]>([]);
  const doctorFilterRef = useRef<HTMLDivElement>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  const [viewEntry, setViewEntry] = useState<QueueLogEntry | null>(null);

  const { data: clinic } = useApiData(() => getClinicSettings(), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tab, dateFrom, dateTo, doctorFilter?.user_id, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (doctorFilterRef.current && !doctorFilterRef.current.contains(e.target as Node)) setDoctorFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (doctorFilterSearch.trim().length < 1) {
      setDoctorFilterResults([]);
      return;
    }
    const t = setTimeout(() => {
      getDoctors(doctorFilterSearch).then(setDoctorFilterResults);
    }, 300);
    return () => clearTimeout(t);
  }, [doctorFilterSearch]);

  const params: QueueLogParams = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      doctorId: doctorFilter?.user_id,
      action: tab === 'all' ? undefined : tab,
      search: search || undefined,
      page,
      limit,
    }),
    [dateFrom, dateTo, doctorFilter?.user_id, tab, search, page, limit]
  );

  const { data: result, loading, reload } = useApiData(() => listQueueLog(params), [params]);
  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  const handleExport = useCallback(async () => {
    const all = await listQueueLog({ ...params, page: 1, limit: 1000 });
    const blob = new Blob([toCsv(all.data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skip-recall-log-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [params, dateFrom, dateTo]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <XCircleIcon />
            </span>
            Skip / Recall Log
          </h1>
          <p>View all skipped and recalled patients from the live queue.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={reload} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      <div className="pat-filter-bar">
        <div className="srl-filter-row" style={{ flex: 1 }}>
          <div className="modal-field">
            <label>Date Range</label>
            <div className="srl-date-range">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span>to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="modal-field">
            <label>Branch / Location</label>
            <input value={clinic?.clinic_name ?? 'Loading…'} disabled style={{ width: 170 }} />
          </div>
          <div className="modal-field">
            <label>Doctor / Consultant</label>
            <div className="bk-doctor-select" ref={doctorFilterRef} style={{ width: 170 }}>
              {doctorFilter && !doctorFilterOpen ? (
                <button type="button" className="bk-doctor-btn" onClick={() => setDoctorFilterOpen(true)}>
                  <div className="pat-avatar" style={{ width: 26, height: 26 }}>
                    {initials(doctorFilter.username)}
                  </div>
                  <div className="bk-doctor-name">Dr. {doctorFilter.username}</div>
                </button>
              ) : (
                <div className="pat-search" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  <SearchIcon />
                  <input
                    placeholder="All Doctors"
                    value={doctorFilterSearch}
                    onFocus={() => setDoctorFilterOpen(true)}
                    onChange={(e) => {
                      setDoctorFilterSearch(e.target.value);
                      setDoctorFilterOpen(true);
                    }}
                  />
                </div>
              )}
              {doctorFilterOpen && (
                <div className="bk-doctor-dropdown">
                  <div
                    className="bk-doctor-option"
                    onClick={() => {
                      setDoctorFilter(null);
                      setDoctorFilterSearch('');
                      setDoctorFilterOpen(false);
                    }}
                  >
                    <div className="bk-doctor-name">All Doctors</div>
                  </div>
                  {doctorFilterResults.map((doc) => (
                    <div
                      key={doc.user_id}
                      className="bk-doctor-option"
                      onClick={() => {
                        setDoctorFilter(doc);
                        setDoctorFilterSearch('');
                        setDoctorFilterOpen(false);
                      }}
                    >
                      <div className="pat-avatar" style={{ width: 26, height: 26 }}>
                        {initials(doc.username)}
                      </div>
                      <div className="bk-doctor-name">Dr. {doc.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="pat-search" style={{ maxWidth: 260 }}>
          <SearchIcon />
          <input placeholder="Search by patient name or ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
      </div>

      <div className="pat-table-card">
        <div className="srl-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`srl-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
          <div className="srl-tabs-actions">
            <button className="pat-btn" onClick={handleExport}>
              <DownloadIcon /> Export
            </button>
          </div>
        </div>

        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date &amp; Time</th>
                <th>Action</th>
                <th>Patient</th>
                <th>Patient ID</th>
                <th>Doctor / Consultant</th>
                <th>Reason / Notes</th>
                <th>Action By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="pat-empty">
                    No skip/recall activity found for these filters.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.log_id}>
                  <td>{(pagination ? (pagination.page - 1) * pagination.limit : 0) + i + 1}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>
                    <span className={`badge ${r.action === 'Skipped' ? 'badge-amber' : 'badge-green'} srl-action-badge`}>{r.action}</span>
                  </td>
                  <td className="srl-patient-cell">
                    <div className="name">{displayPatientName(r.appointment)}</div>
                    <div className="sub">
                      {r.appointment.patient ? `${calculateAge(r.appointment.patient.dob)} Y | ${r.appointment.patient.gender}` : r.appointment.temp_patient_gender ?? '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${r.appointment.is_temporary ? 'badge-amber' : 'badge-blue'}`}>{displayPatientId(r.appointment)}</span>
                  </td>
                  <td className="srl-doctor-cell">
                    <div>Dr. {r.appointment.doctor.username}</div>
                    <div className="sub">{r.appointment.doctor.registration_number ? `Reg: ${r.appointment.doctor.registration_number}` : ''}</div>
                  </td>
                  <td className="srl-reason-cell">{r.reason || '—'}</td>
                  <td className="srl-actor-cell">
                    <div>{r.actor.username}</div>
                    <div className="sub">{r.actor.role}</div>
                  </td>
                  <td>
                    <button className="pat-id-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setViewEntry(r)}>
                      <EyeIcon /> View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && (
          <div className="pat-pagination">
            <div className="pat-pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
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

      {viewEntry && <ViewLogModal entry={viewEntry} onClose={() => setViewEntry(null)} />}
    </div>
  );
};

export default SkipRecallLog;
