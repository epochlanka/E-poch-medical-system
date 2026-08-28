import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getDoctors } from '../../lib/appointments';
import type { Doctor } from '../../lib/appointments';
import { listPrescriptions, getPrescriptionStats, getPrescription, downloadPrescriptionPdf, displayDetailPatient } from '../../lib/prescriptions';
import type { ListPrescriptionsParams, PrescriptionDetail } from '../../lib/prescriptions';
import { setPrescriptionPreparing } from '../../lib/pharmacy';
import {
  ClipboardIcon,
  ClockIcon,
  PrescriptionIcon,
  CheckCircleIcon,
  PharmacyIcon,
  DownloadIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  EyeIcon,
  XIcon,
  PatientsIcon,
  PillIcon,
  PaperclipIcon,
  PrintIcon,
  SendIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge, formatDateTime } from './patientUtils';
import { CONSULTATION_TYPES, STATUS_BADGE } from './prescriptionUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import './bookAppointment.css';
import './prescriptions.css';

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const Prescriptions = () => {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(3));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));
  const [status, setStatus] = useState('');
  const [consultationType, setConsultationType] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<Doctor | null>(null);
  const [doctorFilterOpen, setDoctorFilterOpen] = useState(false);
  const [doctorFilterSearch, setDoctorFilterSearch] = useState('');
  const [doctorFilterResults, setDoctorFilterResults] = useState<Doctor[]>([]);
  const doctorFilterRef = useRef<HTMLDivElement>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(8);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PrescriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: stats, reload: reloadStats } = useApiData(() => getPrescriptionStats(), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, status, consultationType, doctorFilter?.user_id, search]);

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

  const params: ListPrescriptionsParams = useMemo(
    () => ({
      from: dateFrom || undefined,
      to: dateTo || undefined,
      status: (status || undefined) as ListPrescriptionsParams['status'],
      consultationType: consultationType || undefined,
      doctorId: doctorFilter?.user_id,
      search: search || undefined,
      page,
      limit,
    }),
    [dateFrom, dateTo, status, consultationType, doctorFilter?.user_id, search, page, limit]
  );

  const { data: result, loading, reload: reloadList } = useApiData(() => listPrescriptions(params), [params]);
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

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setActionError(null);
    getPrescription(selectedId)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const reloadAll = () => {
    reloadStats();
    reloadList();
  };

  const handleExport = async () => {
    const all = await listPrescriptions({ ...params, page: 1, limit: 1000 });
    const header = ['Rx No.', 'Date & Time', 'Patient', 'Patient ID', 'Doctor', 'Consultation', 'Status', 'Items'];
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const body = all.data.map((rx) => [
      rx.code,
      formatDateTime(rx.issuedAt),
      rx.patientName,
      rx.patientId,
      `Dr. ${rx.doctorName}`,
      rx.consultationType ?? '',
      rx.status,
      String(rx.items.length),
    ]);
    const csv = [header, ...body].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prescriptions-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartDispensing = async () => {
    if (!detail) return;
    setStarting(true);
    setActionError(null);
    try {
      await setPrescriptionPreparing(detail.prescription_id);
      const refreshed = await getPrescription(detail.prescription_id);
      setDetail(refreshed);
      reloadAll();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to start dispensing.');
    } finally {
      setStarting(false);
    }
  };

  const handlePrint = async () => {
    if (!detail) return;
    setPrinting(true);
    try {
      await downloadPrescriptionPdf(detail.prescription_id, `RX${String(detail.prescription_id).padStart(6, '0')}`);
    } catch {
      setActionError('Failed to download the prescription PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <ClipboardIcon />
            </span>
            Prescriptions
          </h1>
          <p>View and manage all prescriptions sent for dispensing.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport}>
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

      <div className="dash-kpi-row">
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Total Prescriptions</div>
              <div className="kpi-value">{stats ? stats.total : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              <ClipboardIcon />
            </div>
          </div>
          <div className="ph-kpi-sub" style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            All time
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Pending</div>
              <div className="kpi-value">{stats ? stats.pending : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
              <ClockIcon />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Awaiting dispensing</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Preparing</div>
              <div className="kpi-value">{stats ? stats.preparing : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              <PrescriptionIcon />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Being prepared</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Dispensed</div>
              <div className="kpi-value">{stats ? stats.dispensed : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <CheckCircleIcon />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Completed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Collected</div>
              <div className="kpi-value">{stats ? stats.collected : '—'}</div>
            </div>
            <div className="kpi-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}>
              <PharmacyIcon />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Handed over to patient</div>
        </div>
      </div>

      {actionError && <div className="dash-error-banner">{actionError}</div>}

      <div className="pat-filter-bar">
        <div className="rx-filter-row" style={{ flex: 1 }}>
          <div className="modal-field">
            <label>Date Range</label>
            <div className="rx-date-range">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span>to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="modal-field">
            <label>Status</label>
            <select className="pat-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Preparing">Preparing</option>
              <option value="Dispensed">Dispensed</option>
              <option value="Collected">Collected</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Doctor</label>
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
          <div className="modal-field">
            <label>Consultation Type</label>
            <select className="pat-select" value={consultationType} onChange={(e) => setConsultationType(e.target.value)}>
              <option value="">All Consultation Types</option>
              {CONSULTATION_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="pat-search" style={{ maxWidth: 240 }}>
          <SearchIcon />
          <input placeholder="Search by patient name, ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
      </div>

      <div className={`rx-layout${selectedId ? ' with-detail' : ''}`} style={{ marginTop: 16 }}>
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Rx No.</th>
                  <th>Date &amp; Time</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Consultation</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="pat-empty">
                      No prescriptions found for these filters.
                    </td>
                  </tr>
                )}
                {rows.map((rx) => (
                  <tr key={rx.prescriptionId} style={{ background: selectedId === rx.prescriptionId ? '#f5f8ff' : undefined }}>
                    <td>
                      <ChevronDownIcon />
                    </td>
                    <td>
                      <button className="pat-id-link" onClick={() => setSelectedId(rx.prescriptionId)}>
                        {rx.code}
                      </button>
                    </td>
                    <td>{formatDateTime(rx.issuedAt)}</td>
                    <td>
                      <div className="pat-name">{rx.patientName}</div>
                      <span className="pat-muted" style={{ fontSize: 11.5 }}>
                        {rx.patientId}
                      </span>
                    </td>
                    <td>Dr. {rx.doctorName}</td>
                    <td>{rx.consultationType ?? '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[rx.status]}`}>{rx.status}</span>
                    </td>
                    <td>{rx.items.length}</td>
                    <td>
                      <button className="pat-icon-btn" onClick={() => setSelectedId(rx.prescriptionId)} title="View">
                        <EyeIcon />
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

        {selectedId && (
          <div className="rx-detail-panel">
            <div className="rx-detail-header">
              <div className="rx-detail-code">
                {detail ? `RX${String(detail.prescription_id).padStart(6, '0')}` : '…'}
                {detail && <span className={`badge ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>}
              </div>
              <button className="rx-detail-close" onClick={() => setSelectedId(null)}>
                <XIcon />
              </button>
            </div>

            {detailLoading && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>}

            {detail && (() => {
              const patient = displayDetailPatient(detail);
              return (
              <>
                <div className="rx-detail-section">
                  <div className="rx-detail-section-title">
                    <PatientsIcon /> Patient Information {patient.isTemporary && <span className="badge badge-amber">Temporary</span>}
                  </div>
                  <div className="rx-detail-grid">
                    <div className="rx-detail-field" style={{ gridColumn: 'span 2' }}>
                      <span className="rx-detail-label">Patient Name</span>
                      <span className="rx-detail-value">{patient.fullName}</span>
                    </div>
                    <div className="rx-detail-field">
                      <span className="rx-detail-label">Patient ID</span>
                      <span className="rx-detail-value">{patient.patientId ?? 'Temporary'}</span>
                    </div>
                    <div className="rx-detail-field">
                      <span className="rx-detail-label">Age / Gender</span>
                      <span className="rx-detail-value">
                        {patient.dob ? `${calculateAge(patient.dob)} Y` : patient.approxAge ? `~${patient.approxAge} Y` : '—'} / {patient.gender ?? '—'}
                      </span>
                    </div>
                    <div className="rx-detail-field" style={{ gridColumn: 'span 2' }}>
                      <span className="rx-detail-label">Contact</span>
                      <span className="rx-detail-value">{patient.phone || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="rx-detail-section">
                  <div className="rx-detail-section-title">
                    <ClipboardIcon /> Prescription Information
                  </div>
                  <div className="rx-detail-grid">
                    <div className="rx-detail-field" style={{ gridColumn: 'span 2' }}>
                      <span className="rx-detail-label">Date &amp; Time</span>
                      <span className="rx-detail-value">{formatDateTime(detail.issued_at)}</span>
                    </div>
                    <div className="rx-detail-field">
                      <span className="rx-detail-label">Doctor</span>
                      <span className="rx-detail-value">Dr. {detail.consultation.appointment.doctor.username}</span>
                    </div>
                    <div className="rx-detail-field">
                      <span className="rx-detail-label">Consultation Type</span>
                      <span className="rx-detail-value">{detail.consultation.appointment.consultation_type ?? '—'}</span>
                    </div>
                    <div className="rx-detail-field">
                      <span className="rx-detail-label">Appointment</span>
                      <span className="rx-detail-value">#{detail.consultation.appointment.appointment_id}</span>
                    </div>
                    {detail.notes && (
                      <div className="rx-detail-field" style={{ gridColumn: 'span 2' }}>
                        <span className="rx-detail-label">Notes</span>
                        <span className="rx-detail-value">{detail.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rx-detail-section">
                  <div className="rx-detail-section-title">
                    <PillIcon /> Prescribed Medicines ({detail.items.length})
                  </div>
                  {detail.items.map((item, i) => (
                    <div className="rx-med-item" key={item.rx_item_id}>
                      <span className="rx-med-num">{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div className="rx-med-name">{item.substituted_medicine?.name ?? item.medicine.name}</div>
                        <div className="rx-med-sub">
                          {item.dosage}
                          {item.frequency ? ` · ${item.frequency}` : ''}
                          {item.instructions ? ` · ${item.instructions}` : ''}
                        </div>
                      </div>
                      <div className="rx-med-qty">
                        Qty: {item.qty}
                        <div className="sub">{item.duration || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rx-detail-section">
                  <div className="rx-detail-section-title">
                    <PaperclipIcon /> Attachments
                  </div>
                  <div style={{ fontSize: 12.5, color: '#94a3b8' }}>No attachments.</div>
                </div>

                <div className="rx-detail-actions">
                  <button className="pat-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePrint} disabled={printing}>
                    <PrintIcon /> {printing ? 'Preparing…' : 'Print Prescription'}
                  </button>
                  {detail.status === 'Pending' && (
                    <button className="pat-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleStartDispensing} disabled={starting}>
                      <SendIcon /> {starting ? 'Starting…' : 'Start Dispensing'}
                    </button>
                  )}
                </div>
              </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Prescriptions;
