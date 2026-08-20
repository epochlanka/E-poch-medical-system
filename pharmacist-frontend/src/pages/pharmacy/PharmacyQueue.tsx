import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getDoctors } from '../../lib/appointments';
import type { Doctor } from '../../lib/appointments';
import { getPharmacyQueue, setPrescriptionPreparing, collectPrescription } from '../../lib/pharmacy';
import type { QueueBoard, QueueItem, QueueStatus } from '../../lib/pharmacy';
import { getPrescription, downloadPrescriptionPdf } from '../../lib/prescriptions';
import type { PrescriptionDetail } from '../../lib/prescriptions';
import {
  UsersIcon,
  ClockIcon,
  ClipboardIcon,
  CheckCircleIcon,
  PharmacyIcon,
  RefreshIcon,
  FilterIcon,
  SearchIcon,
  InfoIcon,
  PatientsIcon,
  StethoscopeIcon,
  XIcon,
  PrintIcon,
  SendIcon,
  PillIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge, formatDateTime, formatSmartTime } from '../prescriptions/patientUtils';
import { CONSULTATION_TYPES } from '../prescriptions/prescriptionUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../prescriptions/bookAppointment.css';
import '../prescriptions/prescriptions.css';
import './pharmacyQueue.css';

const PREVIEW_COUNT = 3;

const EMPTY_BOARD: QueueBoard = { Pending: [], Preparing: [], Dispensed: [], Collected: [] };

const COLUMN_META: Record<QueueStatus, { title: string; cls: string; icon: React.ReactNode; badgeLabel: string }> = {
  Pending: { title: 'Pending', cls: 'pending', icon: <ClockIcon />, badgeLabel: 'Waiting' },
  Preparing: { title: 'Preparing', cls: 'preparing', icon: <ClipboardIcon />, badgeLabel: 'Preparing' },
  Dispensed: { title: 'Dispensed', cls: 'dispensed', icon: <CheckCircleIcon />, badgeLabel: 'Dispensed' },
  Collected: { title: 'Collected', cls: 'collected', icon: <PharmacyIcon />, badgeLabel: 'Collected' },
};

const matchesFilters = (item: QueueItem, search: string, doctorId?: number, consultationType?: string) => {
  if (doctorId && item.doctorId !== doctorId) return false;
  if (consultationType && item.consultationType !== consultationType) return false;
  if (search) {
    const s = search.toLowerCase();
    const haystack = `${item.code} ${item.patientName} ${item.patientId} ${item.doctorName}`.toLowerCase();
    if (!haystack.includes(s)) return false;
  }
  return true;
};

const Card = ({
  item,
  onOpen,
  onAction,
  actionBusy,
}: {
  item: QueueItem;
  onOpen: () => void;
  onAction?: () => void;
  actionBusy: boolean;
}) => {
  const meta = COLUMN_META[item.status];
  return (
    <div className="pq-card" onClick={onOpen}>
      <div className="pq-card-top">
        <span className="pq-card-code">{item.code}</span>
        <span className="pq-card-time">{formatSmartTime(item.status === 'Pending' || item.status === 'Preparing' ? item.issuedAt : item.lastActivityAt)}</span>
      </div>
      <div className="pq-card-row name">
        <PatientsIcon /> {item.patientName}
      </div>
      <div className="pq-card-row">
        <StethoscopeIcon /> Dr. {item.doctorName}
      </div>
      <div className="pq-card-type">{item.consultationType ?? '—'}</div>
      <div className="pq-card-bottom">
        <span className={`badge badge-${item.status === 'Pending' ? 'amber' : item.status === 'Preparing' ? 'blue' : item.status === 'Dispensed' ? 'green' : 'purple'}`}>
          {meta.badgeLabel}
        </span>
        <span className="pq-card-items">{item.itemCount} Item{item.itemCount === 1 ? '' : 's'}</span>
      </div>
      {onAction && (
        <button
          className={`pq-card-action ${item.status === 'Pending' ? 'pending' : 'dispensed'}`}
          disabled={actionBusy}
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
        >
          {item.status === 'Pending' ? (actionBusy ? 'Starting…' : 'Start Preparing') : actionBusy ? 'Collecting…' : 'Mark Collected'}
        </button>
      )}
      {item.status === 'Preparing' && (
        <Link className="pq-card-action preparing" to={`/pharmacy/dispensing/${item.prescriptionId}`} onClick={(e) => e.stopPropagation()}>
          Continue Dispensing
        </Link>
      )}
    </div>
  );
};

const Column = ({
  status,
  items,
  onOpen,
  onAction,
  busyId,
}: {
  status: QueueStatus;
  items: QueueItem[];
  onOpen: (id: number) => void;
  onAction?: (id: number) => void;
  busyId: number | null;
}) => {
  const [expanded, setExpanded] = useState(false);
  const meta = COLUMN_META[status];
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const remaining = items.length - visible.length;

  return (
    <div className={`pq-column ${meta.cls}`}>
      <div className="pq-column-header">
        <span className="pq-column-title">
          {meta.icon} {meta.title} ({items.length})
        </span>
        <span className="pq-column-count">{items.length}</span>
      </div>
      {visible.length === 0 && <div className="pq-column-empty">No prescriptions here.</div>}
      {visible.map((item) => (
        <Card
          key={item.prescriptionId}
          item={item}
          onOpen={() => onOpen(item.prescriptionId)}
          onAction={onAction && (status === 'Pending' || status === 'Dispensed') ? () => onAction(item.prescriptionId) : undefined}
          actionBusy={busyId === item.prescriptionId}
        />
      ))}
      {items.length > PREVIEW_COUNT && (
        <button className="pq-column-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `+ ${remaining} more`}
        </button>
      )}
    </div>
  );
};

const PharmacyQueue = () => {
  const { data: boardData, loading, reload } = useApiData(() => getPharmacyQueue(), []);
  const board = boardData ?? EMPTY_BOARD;
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (boardData) setLastUpdated(new Date());
  }, [boardData]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [doctorFilter, setDoctorFilter] = useState<Doctor | null>(null);
  const [doctorFilterSearch, setDoctorFilterSearch] = useState('');
  const [doctorFilterResults, setDoctorFilterResults] = useState<Doctor[]>([]);
  const [consultationTypeFilter, setConsultationTypeFilter] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (doctorFilterSearch.trim().length < 1) {
      setDoctorFilterResults([]);
      return;
    }
    const t = setTimeout(() => getDoctors(doctorFilterSearch).then(setDoctorFilterResults), 300);
    return () => clearTimeout(t);
  }, [doctorFilterSearch]);

  const activeFilterCount = (doctorFilter ? 1 : 0) + (consultationTypeFilter ? 1 : 0);

  const filteredBoard: QueueBoard = useMemo(() => {
    const apply = (items: QueueItem[]) => items.filter((i) => matchesFilters(i, search, doctorFilter?.user_id, consultationTypeFilter || undefined));
    return { Pending: apply(board.Pending), Preparing: apply(board.Preparing), Dispensed: apply(board.Dispensed), Collected: apply(board.Collected) };
  }, [board, search, doctorFilter?.user_id, consultationTypeFilter]);

  const totalInQueue = board.Pending.length + board.Preparing.length + board.Dispensed.length + board.Collected.length;

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PrescriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    getPrescription(selectedId)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const runAction = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      reload();
      if (selectedId === id) {
        const refreshed = await getPrescription(id);
        setDetail(refreshed);
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Action failed.');
    } finally {
      setBusyId(null);
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
            <span style={{ marginRight: 8, color: '#16a34a', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Pharmacy Queue
          </h1>
          <p>Manage and track the status of prescriptions in the pharmacy.</p>
        </div>
        <div className="pat-header-actions" style={{ position: 'relative' }} ref={filterRef}>
          <button className="pat-btn" onClick={() => setFilterOpen((o) => !o)}>
            <FilterIcon /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          <button className="pat-btn" onClick={reload} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
          {filterOpen && (
            <div className="pq-filter-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-field">
                <label>Doctor</label>
                <input
                  placeholder="All Doctors"
                  value={doctorFilter ? `Dr. ${doctorFilter.username}` : doctorFilterSearch}
                  onChange={(e) => {
                    setDoctorFilter(null);
                    setDoctorFilterSearch(e.target.value);
                  }}
                />
                {doctorFilterResults.length > 0 && !doctorFilter && (
                  <div className="bk-doctor-dropdown" style={{ position: 'static', marginTop: 4 }}>
                    {doctorFilterResults.map((doc) => (
                      <div
                        key={doc.user_id}
                        className="bk-doctor-option"
                        onClick={() => {
                          setDoctorFilter(doc);
                          setDoctorFilterSearch('');
                          setDoctorFilterResults([]);
                        }}
                      >
                        <div className="pat-avatar" style={{ width: 24, height: 24 }}>
                          {initials(doc.username)}
                        </div>
                        <div className="bk-doctor-name">Dr. {doc.username}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-field" style={{ marginTop: 10 }}>
                <label>Consultation Type</label>
                <select className="pat-select" value={consultationTypeFilter} onChange={(e) => setConsultationTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  {CONSULTATION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="pq-filter-actions">
                <button
                  className="pat-btn"
                  onClick={() => {
                    setDoctorFilter(null);
                    setDoctorFilterSearch('');
                    setConsultationTypeFilter('');
                  }}
                >
                  Clear
                </button>
                <button className="pat-btn primary" onClick={() => setFilterOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {actionError && <div className="dash-error-banner">{actionError}</div>}

      <div className="pq-stat-row">
        <div className="pq-stat">
          <div className="pq-stat-icon" style={{ background: '#f1f5f9', color: '#334155' }}>
            <UsersIcon />
          </div>
          <div>
            <div className="pq-stat-label">Total in Queue</div>
            <div className="pq-stat-value">{totalInQueue}</div>
          </div>
        </div>
        <div className="pq-stat">
          <div className="pq-stat-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
            <ClockIcon />
          </div>
          <div>
            <div className="pq-stat-label">Pending</div>
            <div className="pq-stat-value">{board.Pending.length}</div>
          </div>
        </div>
        <div className="pq-stat">
          <div className="pq-stat-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            <ClipboardIcon />
          </div>
          <div>
            <div className="pq-stat-label">Preparing</div>
            <div className="pq-stat-value">{board.Preparing.length}</div>
          </div>
        </div>
        <div className="pq-stat">
          <div className="pq-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircleIcon />
          </div>
          <div>
            <div className="pq-stat-label">Dispensed</div>
            <div className="pq-stat-value">{board.Dispensed.length}</div>
          </div>
        </div>
        <div className="pq-stat">
          <div className="pq-stat-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}>
            <PharmacyIcon />
          </div>
          <div>
            <div className="pq-stat-label">Collected</div>
            <div className="pq-stat-value">{board.Collected.length}</div>
          </div>
        </div>
        <div className="pat-search pq-stat-search">
          <SearchIcon />
          <input placeholder="Search prescription, patient…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
      </div>

      <div className="pq-board">
        <Column status="Pending" items={filteredBoard.Pending} onOpen={setSelectedId} onAction={(id) => runAction(id, () => setPrescriptionPreparing(id))} busyId={busyId} />
        <Column status="Preparing" items={filteredBoard.Preparing} onOpen={setSelectedId} busyId={busyId} />
        <Column status="Dispensed" items={filteredBoard.Dispensed} onOpen={setSelectedId} onAction={(id) => runAction(id, () => collectPrescription(id))} busyId={busyId} />
        <Column status="Collected" items={filteredBoard.Collected} onOpen={setSelectedId} busyId={busyId} />
      </div>

      <div className="pq-footer">
        <span className="pq-footer-note">
          <InfoIcon /> Queue is ordered by prescription submission time (oldest first).
        </span>
        <span className="pq-footer-updated">
          <RefreshIcon /> Last updated: {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : '—'}
        </span>
      </div>

      {selectedId && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                {detail ? `RX${String(detail.prescription_id).padStart(6, '0')}` : '…'}
                {detail && <span className={`badge badge-${detail.status === 'Pending' ? 'amber' : detail.status === 'Preparing' ? 'blue' : detail.status === 'Dispensed' ? 'green' : 'purple'}`} style={{ marginLeft: 8 }}>{detail.status}</span>}
              </span>
              <button className="pat-icon-btn" onClick={() => setSelectedId(null)}>
                <XIcon />
              </button>
            </div>

            {detailLoading && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</p>}

            {detail && (
              <>
                <div className="pq-detail-grid" style={{ marginTop: 10 }}>
                  <div className="pq-detail-field">
                    <span className="pq-detail-label">Patient</span>
                    <span className="pq-detail-value">{detail.consultation.appointment.patient.full_name}</span>
                  </div>
                  <div className="pq-detail-field">
                    <span className="pq-detail-label">Age / Gender</span>
                    <span className="pq-detail-value">
                      {calculateAge(detail.consultation.appointment.patient.dob)} Y / {detail.consultation.appointment.patient.gender}
                    </span>
                  </div>
                  <div className="pq-detail-field">
                    <span className="pq-detail-label">Doctor</span>
                    <span className="pq-detail-value">Dr. {detail.consultation.appointment.doctor.username}</span>
                  </div>
                  <div className="pq-detail-field">
                    <span className="pq-detail-label">Consultation</span>
                    <span className="pq-detail-value">{detail.consultation.appointment.consultation_type ?? '—'}</span>
                  </div>
                  <div className="pq-detail-field" style={{ gridColumn: 'span 2' }}>
                    <span className="pq-detail-label">Submitted</span>
                    <span className="pq-detail-value">{formatDateTime(detail.issued_at)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="rx-detail-section-title">
                    <PillIcon /> Medicines ({detail.items.length})
                  </div>
                  {detail.items.map((item, i) => (
                    <div className="rx-med-item" key={item.rx_item_id}>
                      <span className="rx-med-num">{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div className="rx-med-name">{item.substituted_medicine?.name ?? item.medicine.name}</div>
                        <div className="rx-med-sub">
                          {item.dosage}
                          {item.frequency ? ` · ${item.frequency}` : ''}
                        </div>
                      </div>
                      <div className="rx-med-qty">
                        Qty: {item.qty}
                        <div className="sub">{item.batch_id ? 'Dispensed' : 'Pending'}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="modal-actions" style={{ marginTop: 14 }}>
                  <button className="pat-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePrint} disabled={printing}>
                    <PrintIcon /> {printing ? 'Preparing…' : 'Print'}
                  </button>
                  {detail.status === 'Pending' && (
                    <button
                      className="pat-btn primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={busyId === detail.prescription_id}
                      onClick={() => runAction(detail.prescription_id, () => setPrescriptionPreparing(detail.prescription_id))}
                    >
                      <SendIcon /> {busyId === detail.prescription_id ? 'Starting…' : 'Start Preparing'}
                    </button>
                  )}
                  {detail.status === 'Dispensed' && (
                    <button
                      className="pat-btn primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      disabled={busyId === detail.prescription_id}
                      onClick={() => runAction(detail.prescription_id, () => collectPrescription(detail.prescription_id))}
                    >
                      <CheckCircleIcon /> {busyId === detail.prescription_id ? 'Collecting…' : 'Mark Collected'}
                    </button>
                  )}
                  {detail.status === 'Preparing' && (
                    <Link className="pat-btn primary" style={{ flex: 1, justifyContent: 'center' }} to={`/pharmacy/dispensing/${detail.prescription_id}`}>
                      <SendIcon /> Continue Dispensing
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacyQueue;
