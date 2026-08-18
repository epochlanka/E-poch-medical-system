import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients, getPatientById, getPatientHistory, downloadPatientHistoryPdf } from '../../lib/patients';
import type { TimelineEvent } from '../../lib/patients';
import { listConsultations } from '../../lib/consultations';
import { listPrescriptions, downloadPrescriptionPdf } from '../../lib/prescriptions';
import { listLabTestOrders, reviewLabTestOrder, printLabTestOrder } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import EnterLabResultModal from './EnterLabResultModal';
import { calculateAge } from '../../lib/queue';
import {
  SearchIcon,
  RefreshIcon,
  DownloadIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  AlertIcon,
  HeartPulseIcon,
  FileIcon,
  PillIcon,
  StarIcon,
  PrescriptionIcon,
  StethoscopeIcon,
  ClipboardIcon,
  MapPinIcon,
  PrintIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import './patients.css';

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
const daysUntil = (iso: string) => Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);

const CONS_BADGE: Record<string, string> = { Draft: 'badge-amber', Finalized: 'badge-green' };
const RX_BADGE: Record<string, string> = { Pending: 'badge-gray', Preparing: 'badge-amber', Dispensed: 'badge-blue', Collected: 'badge-green' };

const PatientSearch = () => {
  const { patientId: routePatientId } = useParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [gender, setGender] = useState('');
  const [ageFrom, setAgeFrom] = useState('');
  const [ageTo, setAgeTo] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  // The URL is the single source of truth for which patient is selected — no separate state to
  // keep in sync, so navigating between /patients/search and /patients/search/:id (e.g. via the
  // sidebar link, which re-renders this same component rather than remounting it) can't go stale.
  const selectedId = routePatientId ?? null;
  const [exporting, setExporting] = useState(false);
  const limit = 10;

  const { data: result, loading, error } = useApiData(
    () =>
      listPatients({
        search: appliedSearch || undefined,
        status,
        gender: gender || undefined,
        ageFrom: ageFrom ? Number(ageFrom) : undefined,
        ageTo: ageTo ? Number(ageTo) : undefined,
        page,
        limit,
      }),
    [appliedSearch, status, gender, ageFrom, ageTo, page]
  );

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setGender('');
    setAgeFrom('');
    setAgeTo('');
    setStatus('active');
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const full = await listPatients({
        search: appliedSearch || undefined,
        status,
        gender: gender || undefined,
        ageFrom: ageFrom ? Number(ageFrom) : undefined,
        ageTo: ageTo ? Number(ageTo) : undefined,
        limit: 500,
      });
      const header = ['Patient', 'MRN', 'Gender', 'Age', 'Phone', 'Last Visit'];
      const lines = full.data.map((p) =>
        [p.full_name, p.patient_id, p.gender, String(calculateAge(p.dob)), p.phone ?? '', p.last_visit ? formatDate(p.last_visit) : '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const csv = [header.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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

  const selectPatient = (id: string) => {
    navigate(`/patients/search/${id}`);
  };
  const backToSearch = () => {
    navigate('/patients/search');
  };

  // Drill-down instead of a cramped side-by-side split: history takes the full page width once a
  // patient is selected (there's a lot to show — banner, 8 tabs, timeline, summary cards — none of
  // which fit legibly in a half-width column), and "Back to Search" returns to the full-width list.
  if (selectedId) {
    return <PatientHistoryPanel patientId={selectedId} onBack={backToSearch} />;
  }

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Patient Search</h1>
          <p>Search and view patient basic information.</p>
        </div>
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search" style={{ flex: 1 }}>
          <SearchIcon />
          <input
                placeholder="Search by name, MRN, phone or NIC…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <button className="pat-btn" onClick={clearFilters}>
              <RefreshIcon /> Clear
            </button>
            <button className="pat-btn primary" onClick={applyFilters}>
              Search
            </button>
          </div>

          <div className="pat-filter-bar">
            <select className="pat-select" value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}>
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <div className="q-filter-field">
              <span className="q-filter-label">Age From</span>
              <input type="number" min={0} className="q-filter-input" style={{ width: 70 }} value={ageFrom} onChange={(e) => { setAgeFrom(e.target.value); setPage(1); }} placeholder="Any" />
            </div>
            <div className="q-filter-field">
              <span className="q-filter-label">Age To</span>
              <input type="number" min={0} className="q-filter-input" style={{ width: 70 }} value={ageTo} onChange={(e) => { setAgeTo(e.target.value); setPage(1); }} placeholder="Any" />
            </div>
            <select className="pat-select" value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All Statuses</option>
            </select>
            <button className="pat-btn" style={{ marginLeft: 'auto' }} disabled={exporting || rows.length === 0} onClick={handleExport}>
              <DownloadIcon /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          {error && <div className="dash-error-banner">Couldn't load patients: {error}</div>}

          <div className="pat-table-card">
            <div className="pat-table-scroll">
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient</th>
                    <th>MRN</th>
                    <th>Gender / Age</th>
                    <th>Phone</th>
                    <th>Last Visit</th>
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
                        <div className="pat-empty">No patients match this filter.</div>
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((p, i) => {
                      const isSelected = selectedId === p.patient_id;
                      return (
                        <tr key={p.patient_id} onClick={() => selectPatient(p.patient_id)} className={`pat-clickable-row${isSelected ? ' selected' : ''}`}>
                          <td className="pat-muted">{((pagination?.page ?? 1) - 1) * limit + i + 1}</td>
                          <td>
                            <div className="pat-name-cell">
                              {p.photo_url ? <img className="pat-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pat-avatar">{initials(p.full_name)}</div>}
                              <div className="pat-name">{p.full_name}</div>
                            </div>
                          </td>
                          <td className="pat-muted">{p.patient_id}</td>
                          <td>
                            <span className={`q-gender-dot ${p.gender === 'Female' ? 'female' : 'male'}`} />
                            {p.gender} / {calculateAge(p.dob)} Y
                          </td>
                          <td className="pat-muted">{p.phone || '—'}</td>
                          <td className="pat-muted">{p.last_visit ? formatDate(p.last_visit) : 'Never'}</td>
                          <td>
                            {isSelected ? (
                              <span className="badge badge-blue">Viewing</span>
                            ) : (
                              <button className="pat-icon-btn" title="View history" onClick={(e) => { e.stopPropagation(); selectPatient(p.patient_id); }}>
                                <EyeIcon />
                              </button>
                            )}
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
                  Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
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
    </div>
  );
};

type Tab = 'overview' | 'consultations' | 'prescriptions' | 'lab' | 'documents' | 'allergies' | 'vitals' | 'notes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'lab', label: 'Lab Results' },
  { key: 'documents', label: 'Documents' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'vitals', label: 'Vitals' },
  { key: 'notes', label: 'Notes' },
];

const eventIcon = (type: TimelineEvent['type']) => {
  switch (type) {
    case 'consultation':
      return { icon: <StethoscopeIcon />, bg: '#eaf1fe', color: '#2563eb' };
    case 'prescription':
      return { icon: <PrescriptionIcon />, bg: '#dcfce7', color: '#16a34a' };
    case 'document':
      return { icon: <FileIcon />, bg: '#f3e8ff', color: '#7c3aed' };
    case 'vitals':
      return { icon: <HeartPulseIcon />, bg: '#fef3c7', color: '#b45309' };
    default:
      return { icon: <CalendarIcon />, bg: '#f1f5f9', color: '#64748b' };
  }
};

const PatientHistoryPanel = ({ patientId, onBack }: { patientId: string; onBack: () => void }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  const { data: patient, loading: patientLoading } = useApiData(() => getPatientById(patientId), [patientId]);
  const { data: history, loading: historyLoading } = useApiData(
    () => getPatientHistory(patientId, { types: ['consultation', 'prescription', 'document', 'vitals'] }),
    [patientId]
  );
  const { data: consultResult } = useApiData(() => listConsultations({ patientId, limit: 50 }), [patientId]);
  const { data: rxResult } = useApiData(() => listPrescriptions({ patientId, limit: 50 }), [patientId]);
  const { data: labResult, reload: reloadLabTestOrders } = useApiData(() => listLabTestOrders({ patientId, limit: 100 }), [patientId]);

  const [resultModalOrder, setResultModalOrder] = useState<LabTestOrder | null>(null);
  const [reviewingOrderId, setReviewingOrderId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const submitReview = async (orderId: number) => {
    setReviewSubmitting(true);
    try {
      await reviewLabTestOrder(orderId, reviewNote.trim() || undefined);
      setReviewingOrderId(null);
      setReviewNote('');
      reloadLabTestOrders();
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (patientLoading || !patient) {
    return (
      <div className="card">
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  const events = history ?? [];
  const visibleEvents = showFullTimeline ? events : events.slice(0, 6);
  const consultations = consultResult?.data ?? [];
  const prescriptions = rxResult?.data ?? [];
  const notesEntries = consultations.filter((c) => c.notes);
  const labTestOrders = labResult?.data ?? [];
  const pendingLabTests = labTestOrders.filter((o) => o.status === 'Pending');
  const completedLabTests = labTestOrders.filter((o) => o.status === 'Result Received' || o.status === 'Reviewed');
  const LAB_STATUS_BADGE: Record<LabTestOrder['status'], string> = {
    Pending: 'badge-amber',
    'Result Received': 'badge-blue',
    Reviewed: 'badge-green',
    Cancelled: 'badge-gray',
  };

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Patient History</h1>
          <p>View complete medical history and timeline.</p>
        </div>
        <button className="pat-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back to Search
        </button>
      </div>

      <div className="pth-banner">
        <div style={{ display: 'flex', gap: 14 }}>
          {patient.photo_url ? <img className="cons-banner-avatar" src={fileUrl(patient.photo_url)} alt="" /> : <div className="cons-banner-avatar">{initials(patient.full_name)}</div>}
          <div>
            <div className="cons-banner-name">
              {patient.full_name}
              <span className={`badge ${patient.is_active ? 'badge-green' : 'badge-gray'}`}>{patient.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="cons-banner-meta">
              MRN: {patient.patient_id} · {patient.gender} · {calculateAge(patient.dob)} Years
            </div>
            {patient.phone && <div className="cons-banner-sub">{patient.phone}</div>}
          </div>
        </div>
        <div className="pth-banner-fields">
          <div className="cons-banner-field">
            <span className="cons-banner-label">Blood Group</span>
            <span className="cons-banner-value">{patient.blood_group || '—'}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Registered On</span>
            <span className="cons-banner-value">{formatDate(patient.created_at)}</span>
          </div>
          <div className="cons-banner-field" style={{ gridColumn: 'span 2' }}>
            <span className="cons-banner-label">
              <MapPinIcon /> Address
            </span>
            <span className="cons-banner-value">{patient.family.address || 'Not recorded'}</span>
          </div>
        </div>
      </div>

      <div className="pth-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`pth-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="cons-layout" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Timeline</h3>
            </div>
            {historyLoading && <div className="card-empty">Loading…</div>}
            {!historyLoading && events.length === 0 && <div className="card-empty">No recorded history for this patient yet.</div>}
            {!historyLoading && events.length > 0 && (
              <div className="pth-timeline">
                {visibleEvents.map((e, i) => {
                  const { icon, bg, color } = eventIcon(e.type);
                  return (
                    <div className="pth-timeline-item" key={`${e.type}-${i}`}>
                      <span className="pth-timeline-dot" style={{ background: bg, color }}>
                        {icon}
                      </span>
                      <div className="pth-timeline-card">
                        <div>
                          <div className="pth-timeline-date">{formatDateTime(e.date)}</div>
                          {e.type === 'consultation' && (
                            <>
                              <div className="pth-timeline-title">Consultation</div>
                              <div className="pth-timeline-desc">{e.diagnosis ? `Diagnosis: ${e.diagnosis}` : 'No diagnosis recorded'}</div>
                            </>
                          )}
                          {e.type === 'prescription' && (
                            <>
                              <div className="pth-timeline-title">Prescription</div>
                              <div className="pth-timeline-desc">
                                {e.items.length} medicine{e.items.length === 1 ? '' : 's'} prescribed —{' '}
                                <span className={`badge ${RX_BADGE[e.status]}`}>{e.status}</span>
                              </div>
                            </>
                          )}
                          {e.type === 'document' && (
                            <>
                              <div className="pth-timeline-title">Document</div>
                              <div className="pth-timeline-desc">{e.originalName}</div>
                            </>
                          )}
                          {e.type === 'vitals' && (
                            <>
                              <div className="pth-timeline-title">Vitals Recorded</div>
                              <div className="pth-timeline-desc">
                                {[
                                  e.vitals.bp_systolic && e.vitals.bp_diastolic ? `BP: ${e.vitals.bp_systolic}/${e.vitals.bp_diastolic} mmHg` : null,
                                  e.vitals.pulse ? `Pulse: ${e.vitals.pulse} bpm` : null,
                                  e.vitals.temp ? `Temp: ${e.vitals.temp} °C` : null,
                                ]
                                  .filter(Boolean)
                                  .join(', ') || 'Recorded'}
                              </div>
                            </>
                          )}
                        </div>
                        {e.type === 'consultation' && (
                          <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => navigate(`/consultations/workspace/${e.appointmentId}`)}>
                            View Details
                          </button>
                        )}
                        {e.type === 'prescription' && (
                          <button
                            className="pat-btn"
                            style={{ fontSize: 11.5, padding: '5px 10px' }}
                            onClick={() => downloadPrescriptionPdf(e.prescriptionId, `RX${String(e.prescriptionId).padStart(6, '0')}`)}
                          >
                            View Prescription
                          </button>
                        )}
                        {e.type === 'document' && (
                          <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => window.open(fileUrl(`/uploads/consultations/${e.filename}`), '_blank')}>
                            View Document
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!historyLoading && events.length > 6 && (
              <button className="card-link" style={{ marginTop: 10 }} onClick={() => setShowFullTimeline((v) => !v)}>
                {showFullTimeline ? 'Show fewer' : 'View Full Timeline'} →
              </button>
            )}
          </div>

          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="pth-side-card-title">
                <AlertIcon /> Allergies
              </div>
              {patient.allergies ? (
                <div className="pth-chip-row allergy">
                  <span className="pth-chip-main">{patient.allergies}</span>
                </div>
              ) : (
                <span className="pat-muted" style={{ fontSize: 12.5 }}>
                  No known allergies recorded.
                </span>
              )}
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="pth-side-card-title">
                <StarIcon /> Chronic Conditions
              </div>
              {patient.clinicalSummary.chronicConditions.length === 0 && (
                <span className="pat-muted" style={{ fontSize: 12.5 }}>
                  None recorded.
                </span>
              )}
              <div className="pth-chip-list">
                {patient.clinicalSummary.chronicConditions.map((c) => (
                  <div className="pth-chip-row condition" key={c}>
                    <span className="pth-chip-main">{c}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="pth-side-card-title">
                <PillIcon /> Current Medications
              </div>
              {patient.clinicalSummary.currentMedications.length === 0 && (
                <span className="pat-muted" style={{ fontSize: 12.5 }}>
                  None recorded.
                </span>
              )}
              <div className="pth-chip-list">
                {patient.clinicalSummary.currentMedications.map((m) => (
                  <div className="pth-chip-row medication" key={m}>
                    <span className="pth-chip-main">{m}</span>
                  </div>
                ))}
              </div>
            </div>

            {patient.clinicalSummary.nextFollowUp && (
              <div className="card">
                <div className="pth-side-card-title">
                  <CalendarIcon /> Next Follow-up
                </div>
                <div className="pth-followup-box">
                  <div className="pth-followup-date">{formatDate(patient.clinicalSummary.nextFollowUp.date)}</div>
                  <div className="pat-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {(() => {
                      const d = daysUntil(patient.clinicalSummary.nextFollowUp.date);
                      return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
                    })()}{' '}
                    · Follow-up visit with Dr. {patient.clinicalSummary.nextFollowUp.doctorName}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'consultations' && (
        <div className="card">
          {consultations.length === 0 && <div className="card-empty">No consultations recorded for this patient.</div>}
          {consultations.map((c) => (
            <div className="pth-list-row" key={c.consultationId}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.diagnosis || c.complaint || 'No diagnosis recorded'}</div>
                <span className="pat-muted" style={{ fontSize: 11.5 }}>
                  {formatDateTime(c.createdAt)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`badge ${CONS_BADGE[c.status]}`}>{c.status}</span>
                <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => navigate(`/consultations/workspace/${c.appointmentId}`)}>
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="card">
          {prescriptions.length === 0 && <div className="card-empty">No prescriptions recorded for this patient.</div>}
          {prescriptions.map((rx) => (
            <div className="pth-list-row" key={rx.prescriptionId}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                  {rx.code} {rx.isRefill && <span className="badge badge-gray">Refill</span>}
                </div>
                <span className="pat-muted" style={{ fontSize: 11.5 }}>
                  {formatDateTime(rx.issuedAt)} · {rx.items.length} medicine{rx.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`badge ${RX_BADGE[rx.status]}`}>{rx.status}</span>
                <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => downloadPrescriptionPdf(rx.prescriptionId, rx.code)}>
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lab' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="pth-side-card-title">
              <ClipboardIcon /> Pending Tests
            </div>
            {pendingLabTests.length === 0 && <div className="card-empty">No pending lab tests for this patient.</div>}
            {pendingLabTests.map((o) => (
              <div className="pth-list-row" key={o.lab_test_order_id}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {o.test_name} {o.priority !== 'Routine' && <span className="badge badge-red">{o.priority}</span>}
                  </div>
                  <span className="pat-muted" style={{ fontSize: 11.5 }}>
                    LAB{String(o.lab_test_order_id).padStart(6, '0')} · Ordered {formatDateTime(o.order_date)} by Dr. {o.doctor?.username}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => printLabTestOrder(o.lab_test_order_id)}>
                    <PrintIcon /> Print Request
                  </button>
                  <button className="pat-btn primary" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setResultModalOrder(o)}>
                    Enter Result
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="pth-side-card-title">
              <ClipboardIcon /> Completed Tests
            </div>
            {completedLabTests.length === 0 && <div className="card-empty">No completed lab results for this patient.</div>}
            {completedLabTests.map((o) => (
              <div key={o.lab_test_order_id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                <div className="pth-list-row" style={{ padding: 0, border: 'none' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{o.test_name}</div>
                    <span className="pat-muted" style={{ fontSize: 11.5 }}>
                      LAB{String(o.lab_test_order_id).padStart(6, '0')} · Result {o.result_date ? formatDateTime(o.result_date) : '—'}
                      {o.entered_by_user ? ` by ${o.entered_by_user.username}` : ''}
                    </span>
                  </div>
                  <span className={`badge ${LAB_STATUS_BADGE[o.status]}`}>{o.status}</span>
                </div>
                <div style={{ fontSize: 13, color: '#334155', marginTop: 6 }}>
                  <strong>Result:</strong> {o.result_value} {o.unit}
                  {o.reference_range && <span className="pat-muted"> (Ref: {o.reference_range})</span>}
                </div>
                {o.laboratory_name && <div className="pat-muted" style={{ fontSize: 12 }}>Laboratory: {o.laboratory_name}</div>}
                {o.result_notes && <div className="pat-muted" style={{ fontSize: 12 }}>Notes: {o.result_notes}</div>}
                {o.status === 'Reviewed' && o.review_notes && (
                  <div className="pat-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Doctor review ({o.reviewed_by_user?.username}, {o.reviewed_date ? formatDateTime(o.reviewed_date) : ''}): {o.review_notes}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {o.report_file_path && (
                    <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => window.open(fileUrl(o.report_file_path!), '_blank')}>
                      View / Print Report
                    </button>
                  )}
                  {o.status === 'Result Received' && reviewingOrderId !== o.lab_test_order_id && (
                    <button className="pat-btn primary" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setReviewingOrderId(o.lab_test_order_id)}>
                      Doctor Review
                    </button>
                  )}
                </div>

                {reviewingOrderId === o.lab_test_order_id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      className="cons-input"
                      style={{ flex: 1 }}
                      placeholder="Review note (optional)"
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                    />
                    <button className="pat-btn primary" style={{ fontSize: 11.5, padding: '5px 10px' }} disabled={reviewSubmitting} onClick={() => submitReview(o.lab_test_order_id)}>
                      {reviewSubmitting ? 'Saving…' : 'Mark Reviewed'}
                    </button>
                    <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setReviewingOrderId(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="pth-side-card-title">
              <ClipboardIcon /> Test History
            </div>
            {labTestOrders.length === 0 && <div className="card-empty">No lab tests have been ordered for this patient.</div>}
            {labTestOrders.length > 0 && (
              <div className="pat-table-scroll">
                <table className="pat-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Test</th>
                      <th>Doctor</th>
                      <th>Ordered</th>
                      <th>Priority</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labTestOrders.map((o) => (
                      <tr key={o.lab_test_order_id}>
                        <td>LAB{String(o.lab_test_order_id).padStart(6, '0')}</td>
                        <td>{o.test_name}</td>
                        <td>Dr. {o.doctor?.username}</td>
                        <td>{formatDateTime(o.order_date)}</td>
                        <td>{o.priority}</td>
                        <td>
                          <span className={`badge ${LAB_STATUS_BADGE[o.status]}`}>{o.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {resultModalOrder && (
        <EnterLabResultModal
          order={resultModalOrder}
          onClose={() => setResultModalOrder(null)}
          onSaved={() => {
            setResultModalOrder(null);
            reloadLabTestOrders();
          }}
        />
      )}

      {tab === 'documents' && (
        <div className="card">
          {events.filter((e) => e.type === 'document').length === 0 && <div className="card-empty">No documents uploaded for this patient.</div>}
          {events
            .filter((e): e is Extract<TimelineEvent, { type: 'document' }> => e.type === 'document')
            .map((doc) => (
              <div className="pth-list-row" key={doc.documentId}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: '#7c3aed' }}>
                    <FileIcon />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.originalName}</div>
                    <span className="pat-muted" style={{ fontSize: 11.5 }}>
                      {formatDateTime(doc.date)}
                    </span>
                  </div>
                </div>
                <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => window.open(fileUrl(`/uploads/consultations/${doc.filename}`), '_blank')}>
                  View
                </button>
              </div>
            ))}
        </div>
      )}

      {tab === 'allergies' && (
        <div className="card">
          <div className="pth-side-card-title">
            <AlertIcon /> Known Allergies
          </div>
          {patient.allergies ? <p style={{ fontSize: 14, color: '#0f172a', margin: 0 }}>{patient.allergies}</p> : <div className="card-empty">No known allergies recorded for this patient.</div>}
        </div>
      )}

      {tab === 'vitals' && (
        <div className="card">
          {events.filter((e) => e.type === 'vitals').length === 0 && <div className="card-empty">No vitals recorded for this patient.</div>}
          {events
            .filter((e): e is Extract<TimelineEvent, { type: 'vitals' }> => e.type === 'vitals')
            .map((v) => (
              <div key={v.consultationId} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                <div className="pat-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
                  {formatDateTime(v.date)}
                </div>
                <div className="cons-vital-stat-grid">
                  {[
                    ['Temperature', v.vitals.temp, '°C'],
                    ['Blood Pressure', v.vitals.bp_systolic && v.vitals.bp_diastolic ? `${v.vitals.bp_systolic}/${v.vitals.bp_diastolic}` : '', 'mmHg'],
                    ['Heart Rate', v.vitals.pulse, 'bpm'],
                    ['SpO2', v.vitals.spo2, '%'],
                    ['Weight', v.vitals.weight, 'kg'],
                    ['BMI', v.vitals.bmi, ''],
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
              </div>
            ))}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card">
          {notesEntries.length === 0 && <div className="card-empty">No consultation notes recorded for this patient.</div>}
          {notesEntries.map((c) => (
            <div className="pth-list-row" key={c.consultationId} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className="pat-muted" style={{ fontSize: 11.5 }}>
                {formatDateTime(c.createdAt)}
              </span>
              <span style={{ color: '#0f172a' }}>{c.notes}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="cons-btn" onClick={() => downloadPatientHistoryPdf(patientId, `${patientId}-history.pdf`)}>
          <DownloadIcon /> Download Full History (PDF)
        </button>
      </div>
    </div>
  );
};

export default PatientSearch;
