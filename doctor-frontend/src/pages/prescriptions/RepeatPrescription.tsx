import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import {
  listPrescriptions,
  getPrescriptionStats,
  getPrescriptionDetail,
  createPrescription,
  downloadPrescriptionPdf,
} from '../../lib/prescriptions';
import { listConsultations } from '../../lib/consultations';
import { calculateAge } from '../../lib/queue';
import {
  RefreshIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  SearchIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertIcon,
  PrintIcon,
  XIcon,
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
const rxCode = (id: number) => `RX${String(id).padStart(6, '0')}`;

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const STATUS_BADGE: Record<string, string> = { Pending: 'badge-gray', Preparing: 'badge-amber', Dispensed: 'badge-blue', Collected: 'badge-green' };

const lastDispensedAt = (items: { dispensedAt: string | null }[]) => {
  const times = items.map((i) => i.dispensedAt).filter((t): t is string => !!t);
  if (times.length === 0) return null;
  return times.reduce((max, t) => (new Date(t) > new Date(max) ? t : max));
};

type Tab = 'search' | 'mine';

const RepeatPrescription = () => {
  const [tab, setTab] = useState<Tab>('search');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const limit = 7;

  const { data: stats } = useApiData(() => getPrescriptionStats({ isRefill: true }));
  const { data: result, loading, error } = useApiData(
    () =>
      listPrescriptions({
        isRefill: tab === 'mine' ? true : undefined,
        status: (status || undefined) as any,
        search: appliedSearch || undefined,
        from: dateFrom || undefined,
        to: dateTo ? endOfDay(new Date(dateTo)).toISOString() : undefined,
        page,
        limit,
      }),
    [tab, status, appliedSearch, dateFrom, dateTo, page]
  );

  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const applyFilters = () => {
    setAppliedSearch(search);
    setPage(1);
  };
  const resetFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
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
          <h1>Repeat Prescription</h1>
          <p>Search and select a previous prescription to create a repeat prescription.</p>
        </div>
      </div>

      <div className="dash-kpi-row">
        <KpiCard icon={<RefreshIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Repeat Prescriptions" value={String(stats?.total ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All Time</span>} />
        <KpiCard icon={<CalendarIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="This Month" value={String(stats?.thisMonth ?? '—')} loading={!stats} changePct={stats?.thisMonthDeltaPct} compareLabel="last month" />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Dispensed" value={String(stats?.dispensed ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.dispensed) : ''}</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Pending" value={String(stats ? stats.pending + stats.preparing : '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.pending + stats.preparing) : ''}</span>} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Collected" value={String(stats?.collected ?? '—')} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>{stats ? pct(stats.collected) : ''}</span>} />
      </div>

      <div className="q-tabs">
        <button className={`q-tab${tab === 'search' ? ' active' : ''}`} onClick={() => { setTab('search'); setPage(1); setSelectedId(null); }}>
          Search Previous Prescriptions
        </button>
        <button className={`q-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => { setTab('mine'); setPage(1); setSelectedId(null); }}>
          My Repeat Prescriptions
        </button>
      </div>

      {error && <div className="dash-error-banner">Couldn't load prescriptions: {error}</div>}

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
        <select className="pat-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Preparing">Preparing</option>
          <option value="Dispensed">Dispensed</option>
          <option value="Collected">Collected</option>
        </select>
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
                  <th>Prescription ID</th>
                  <th>Patient</th>
                  <th>Prescription Date</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="pat-empty">{tab === 'mine' ? "You haven't created any repeat prescriptions yet." : 'No prescriptions match this filter.'}</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => {
                    const dispensedAt = lastDispensedAt(r.items);
                    return (
                      <tr key={r.prescriptionId} style={selectedId === r.prescriptionId ? { background: '#eff6ff' } : undefined} onClick={() => setSelectedId(r.prescriptionId)}>
                        <td>
                          <span className={`q-token${selectedId === r.prescriptionId ? ' next' : ''}`}>{r.code}</span>
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
                        <td className="pat-muted">{r.items.length}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                          {(r.status === 'Dispensed' || r.status === 'Collected') && dispensedAt && (
                            <div className="pat-muted" style={{ fontSize: 11, marginTop: 3 }}>
                              {formatDateTime(dispensedAt)}
                            </div>
                          )}
                        </td>
                        <td>
                          <button className="pat-icon-btn" title="Select" onClick={(e) => { e.stopPropagation(); setSelectedId(r.prescriptionId); }}>
                            <EyeIcon />
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

        {selectedId && <RepeatPanel prescriptionId={selectedId} onClose={() => setSelectedId(null)} />}
      </div>

      {!selectedId && (
        <div className="q-tip-bar" style={{ marginTop: 16 }}>
          Tip: Select a previous prescription and click "Create Repeat Prescription" to continue.
        </div>
      )}
    </div>
  );
};

const RepeatPanel = ({ prescriptionId, onClose }: { prescriptionId: number; onClose: () => void }) => {
  const navigate = useNavigate();
  const { data: rx, loading } = useApiData(() => getPrescriptionDetail(prescriptionId), [prescriptionId]);

  const patientId = rx?.consultation.appointment.patient.patient_id;
  const { data: draftResult } = useApiData(
    () => (patientId ? listConsultations({ status: 'Draft', patientId, limit: 10 }) : Promise.resolve({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } })),
    [patientId]
  );
  const drafts = draftResult?.data ?? [];
  const [targetConsultationId, setTargetConsultationId] = useState<number | null>(null);
  const effectiveTargetId = targetConsultationId ?? (drafts.length === 1 ? drafts[0].consultationId : null);
  const targetConsultation = drafts.find((d) => d.consultationId === effectiveTargetId);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [allergyAck, setAllergyAck] = useState(false);
  const [created, setCreated] = useState<{ id: number; code: string; appointmentId: number } | null>(null);
  const creatingRef = useRef(false);

  const handleCreate = async () => {
    if (creatingRef.current || !effectiveTargetId) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPrescription({ consultation_id: effectiveTargetId, refill_of_prescription_id: prescriptionId, allergyAck });
      const appt = drafts.find((d) => d.consultationId === effectiveTargetId)?.appointmentId ?? 0;
      setCreated({ id: res.data.prescription_id, code: rxCode(res.data.prescription_id), appointmentId: appt });
    } catch (err: any) {
      if (err.response?.status === 409 && err.response.data?.conflicts) {
        setCreateError(`Allergy conflict: ${err.response.data.conflicts.join(', ')} — tick "Acknowledge" below and try again.`);
      } else {
        setCreateError(err.response?.data?.message || 'Failed to create repeat prescription.');
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  if (loading || !rx) {
    return (
      <div className="card">
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="card rxp-success">
        <div className="rxp-success-icon">
          <CheckCircleIcon />
        </div>
        <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>Repeat Prescription Created</h3>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 18px' }}>{created.code} has been sent to the pharmacy.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="cons-btn" onClick={() => downloadPrescriptionPdf(created.id, created.code)}>
            <PrintIcon /> Download PDF
          </button>
          <button className="cons-btn primary" onClick={() => navigate(`/consultations/workspace/${created.appointmentId}`)}>
            Back to Workspace
          </button>
        </div>
      </div>
    );
  }

  const { patient, doctor, appointment_id } = rx.consultation.appointment;
  const code = rxCode(rx.prescription_id);

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
          <span className="cd-meta-label">Prescription Date</span>
          <span className="cd-meta-value">{formatDateTime(rx.issued_at)}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Attending Doctor</span>
          <span className="cd-meta-value">Dr. {doctor.username}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Pharmacy Status</span>
          <span className="cd-meta-value">{rx.status}</span>
        </div>
        <div className="cd-meta-field">
          <span className="cd-meta-label">Total Items</span>
          <span className="cd-meta-value">{rx.items.length}</span>
        </div>
      </div>

      <div className="cd-meta-label" style={{ marginBottom: 8 }}>
        Prescription Items
      </div>
      {rx.items.map((i, idx) => (
        <div className="cons-rx-row" key={i.rx_item_id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>
            {idx + 1}. {i.medicine.name} {i.medicine.strength && `(${i.medicine.strength})`}
          </span>
          <span className="pat-muted" style={{ fontSize: 11.5 }}>
            {[i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}
          </span>
        </div>
      ))}

      {createError && (
        <div className="rxp-alert-box warn" style={{ marginTop: 12 }}>
          <span className="rxp-alert-title">
            <AlertIcon /> Couldn't create repeat prescription
          </span>
          <span className="rxp-alert-body">{createError}</span>
          {createError.startsWith('Allergy conflict') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
              <input type="checkbox" checked={allergyAck} onChange={(e) => setAllergyAck(e.target.checked)} />
              Acknowledge and proceed
            </label>
          )}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
        {drafts.length === 0 && (
          <div className="pat-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            {patient.full_name} has no active consultation right now — start one from Call Next before repeating this prescription.
          </div>
        )}
        {drafts.length === 1 && (
          <div className="pat-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Will be added to {patient.full_name}'s active consultation (started {formatTime(drafts[0].createdAt)}).
          </div>
        )}
        {drafts.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <div className="cd-meta-label" style={{ marginBottom: 4 }}>
              Add to which active consultation?
            </div>
            <select className="pat-select" style={{ width: '100%' }} value={targetConsultationId ?? ''} onChange={(e) => setTargetConsultationId(Number(e.target.value) || null)}>
              <option value="">Select a consultation…</option>
              {drafts.map((d) => (
                <option key={d.consultationId} value={d.consultationId}>
                  Started {formatTime(d.createdAt)} {d.diagnosis ? `— ${d.diagnosis}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="cons-btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!effectiveTargetId || creating} onClick={handleCreate}>
          <RefreshIcon /> {creating ? 'Creating…' : 'Create Repeat Prescription'}
        </button>
        <button className="cons-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => navigate(`/consultations/workspace/${appointment_id}`)}>
          <EyeIcon /> View Full Prescription
        </button>
      </div>

      <div className="rxp-preview-box" style={{ marginTop: 14 }}>
        Repeat prescription will create a new prescription with the same medicines, dosage and instructions.
      </div>
    </div>
  );
};

export default RepeatPrescription;
