import { useCallback, useEffect, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import {
  getDoctors,
  getQueueBoard,
  updateAppointmentStatus,
  skipAppointment,
} from '../../lib/appointments';
import type { Doctor, BoardCard, QueueBoard } from '../../lib/appointments';
import { getClinicSettings } from '../../lib/settings';
import {
  UsersIcon,
  ClockIcon,
  StethoscopeIcon,
  PharmacyIcon,
  CheckCircleIcon,
  RefreshIcon,
  DownloadIcon,
  SearchIcon,
  PhoneIcon,
  AlertIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge } from '../patients/patientUtils';
import { CONSULTATION_TYPES } from './appointmentUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './bookAppointment.css';
import './walkIn.css';
import './liveQueue.css';

const REFRESH_SECONDS = 30;
const PREVIEW_COUNT = 4;

const SKIP_QUICK_REASONS = ['Not responding when called', 'Stepped out / not in waiting area', 'Requested to be seen later'];

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const toCsv = (rows: { column: string; card: BoardCard }[]) => {
  const header = ['Token', 'Column', 'Patient', 'Patient ID', 'Age', 'Gender', 'Doctor', 'Type', 'Status', 'Time'];
  const body = rows.map(({ column, card }) => [
    String(card.token),
    column,
    card.patient_name,
    card.patient_id,
    String(calculateAge(card.dob)),
    card.gender,
    `Dr. ${card.doctor_name}`,
    card.is_walk_in ? 'Walk-in' : card.visit_type,
    card.status,
    formatTime(card.scheduled_at),
  ]);
  return [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
};

const SkipReasonModal = ({ card, onClose, onConfirm }: { card: BoardCard; onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Skip Token #{card.token}</div>
        <div className="modal-subtitle">
          {card.patient_name} ({card.patient_id}) — a reason is required so this can be recalled later.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {SKIP_QUICK_REASONS.map((r) => (
            <button key={r} type="button" className="pat-btn" style={{ fontSize: 12, padding: '7px 10px' }} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="modal-field">
          <label>Reason *</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this patient being skipped?" />
        </div>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            disabled={!reason.trim() || submitting}
            onClick={async () => {
              setSubmitting(true);
              await onConfirm(reason.trim());
              setSubmitting(false);
            }}
          >
            {submitting ? 'Skipping…' : 'Confirm Skip'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RECALL_QUICK_REASONS = ['Patient returned', 'Called back after urgent case', 'Ready now'];

const RecallReasonModal = ({ card, onClose, onConfirm }: { card: BoardCard; onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Recall Token #{card.token}</div>
        <div className="modal-subtitle">
          {card.patient_name} ({card.patient_id}) — a reason is optional but helps the Skip/Recall Log.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {RECALL_QUICK_REASONS.map((r) => (
            <button key={r} type="button" className="pat-btn" style={{ fontSize: 12, padding: '7px 10px' }} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="modal-field">
          <label>Reason (Optional)</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this patient being recalled?" />
        </div>
        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              await onConfirm(reason.trim());
              setSubmitting(false);
            }}
          >
            {submitting ? 'Recalling…' : 'Confirm Recall'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Card = ({ card, column, selected, onClick }: { card: BoardCard; column: 'waiting' | 'doctor' | 'pharmacy' | 'completed'; selected?: boolean; onClick?: () => void }) => {
  const age = calculateAge(card.dob);
  return (
    <div className={`lq-card${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="lq-card-top">
        <span className="lq-card-token">{card.token}</span>
        <span className="lq-card-name">{card.patient_name}</span>
        <span className="lq-card-id">{card.patient_id}</span>
      </div>
      <div className="lq-card-sub">
        {age} Y | {card.gender}
      </div>
      {column === 'waiting' && (
        <div className="lq-card-sub">
          {formatTime(card.scheduled_at)} | {card.is_walk_in ? 'Walk-in' : card.visit_type}
          {card.status === 'Called' ? ' · Called' : ''}
        </div>
      )}
      {column === 'doctor' && (
        <>
          <div className="lq-card-sub">Dr. {card.doctor_name}</div>
          <div className="lq-card-sub lq-card-time">
            <ClockIcon /> Since {formatTime(card.since ?? card.scheduled_at)}
          </div>
        </>
      )}
      {column === 'pharmacy' && (
        <>
          <div className="lq-card-sub">Dispensing</div>
          <div className="lq-card-sub lq-card-time">
            <ClockIcon /> Since {formatTime(card.completed_at ?? card.scheduled_at)}
          </div>
        </>
      )}
      {column === 'completed' && <div className="lq-card-sub">Completed at {formatTime(card.completed_at ?? card.scheduled_at)}</div>}
    </div>
  );
};

const Column = ({
  title,
  sub,
  icon,
  cls,
  cards,
  columnKind,
  selectedId,
  onSelect,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  cls: 'waiting' | 'doctor' | 'pharmacy' | 'completed';
  cards: BoardCard[];
  columnKind: 'waiting' | 'doctor' | 'pharmacy' | 'completed';
  selectedId?: number | null;
  onSelect?: (card: BoardCard) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, PREVIEW_COUNT);
  return (
    <div className={`lq-column ${cls}`}>
      <div className="lq-column-header">
        <span className="lq-column-title">
          {icon} {title}
        </span>
        <span className="lq-column-count">{cards.length}</span>
      </div>
      <div className="lq-column-sub">{sub}</div>
      {visible.length === 0 && <div className="lq-column-empty">No patients here.</div>}
      {visible.map((c) => (
        <Card key={c.appointment_id} card={c} column={columnKind} selected={selectedId === c.appointment_id} onClick={onSelect ? () => onSelect(c) : undefined} />
      ))}
      {cards.length > PREVIEW_COUNT && (
        <button className="lq-column-viewall" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `View All (${cards.length})`}
        </button>
      )}
    </div>
  );
};

const LiveQueueBoard = () => {
  const [date, setDate] = useState(todayStr());
  const [consultationType, setConsultationType] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<Doctor | null>(null);
  const [doctorFilterOpen, setDoctorFilterOpen] = useState(false);
  const [doctorFilterSearch, setDoctorFilterSearch] = useState('');
  const [doctorFilterResults, setDoctorFilterResults] = useState<Doctor[]>([]);
  const doctorFilterRef = useRef<HTMLDivElement>(null);

  const [board, setBoard] = useState<QueueBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [now, setNow] = useState(Date.now());

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [skipTarget, setSkipTarget] = useState<BoardCard | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallTarget, setRecallTarget] = useState<BoardCard | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: clinic } = useApiData(() => getClinicSettings(), []);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQueueBoard({ doctorId: doctorFilter?.user_id, consultationType: consultationType || undefined, date: date || undefined });
      setBoard(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load the live queue.');
    } finally {
      setLoading(false);
    }
  }, [doctorFilter?.user_id, consultationType, date]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    const t = setInterval(fetchBoard, REFRESH_SECONDS * 1000);
    return () => clearInterval(t);
  }, [fetchBoard]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const secondsToRefresh = Math.max(0, REFRESH_SECONDS - Math.floor((now - lastUpdated.getTime()) / 1000));
  const isToday = board?.isToday ?? date === todayStr();

  const dueWaiting = (board?.waiting ?? []).filter((c) => c.status === 'Waiting');
  const selectedCard =
    (selectedId ? board?.waiting.find((c) => c.appointment_id === selectedId) : undefined) ?? dueWaiting[0] ?? board?.waiting[0] ?? null;

  const totalInQueue = board ? board.waiting.length + board.withDoctor.length + board.inPharmacy.length : 0;

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      setSelectedId(null);
      await fetchBoard();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Action failed.');
    }
  };

  const handleCallNext = () => {
    if (!selectedCard || selectedCard.status !== 'Waiting' || !isToday) return;
    runAction(() => updateAppointmentStatus(selectedCard.appointment_id, 'Called'));
  };

  const handleSkip = (reason: string) => {
    if (!skipTarget) return;
    runAction(() => skipAppointment(skipTarget.appointment_id, reason)).then(() => setSkipTarget(null));
  };

  const handleRecall = (reason: string) => {
    if (!recallTarget) return;
    runAction(() => updateAppointmentStatus(recallTarget.appointment_id, 'Waiting', reason || undefined)).then(() => setRecallTarget(null));
  };

  const handleExport = () => {
    if (!board) return;
    const rows: { column: string; card: BoardCard }[] = [
      ...board.waiting.map((card) => ({ column: 'Waiting', card })),
      ...board.withDoctor.map((card) => ({ column: 'With Doctor', card })),
      ...board.inPharmacy.map((card) => ({ column: 'In Pharmacy', card })),
      ...board.completedToday.map((card) => ({ column: 'Completed Today', card })),
      ...board.upcoming.map((card) => ({ column: 'Upcoming', card })),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live-queue-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Live Queue Board
          </h1>
          <p>Monitor and manage today's patient queue in real-time.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={fetchBoard} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
          <button className="pat-btn" onClick={handleExport} disabled={!board}>
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">{error}</div>}
      {actionError && <div className="dash-error-banner">{actionError}</div>}

      <div className="lq-toolbar">
        <div className="modal-field">
          <label>Branch / Location</label>
          <input value={clinic?.clinic_name ?? 'Loading…'} disabled />
        </div>
        <div className="modal-field">
          <label>Consultation Type</label>
          <select value={consultationType} onChange={(e) => setConsultationType(e.target.value)}>
            <option value="">All Types</option>
            {CONSULTATION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="modal-field">
          <label>Doctor / Consultant</label>
          <div className="bk-doctor-select" ref={doctorFilterRef}>
            {doctorFilter && !doctorFilterOpen ? (
              <button type="button" className="bk-doctor-btn" onClick={() => setDoctorFilterOpen(true)}>
                <div className="pat-avatar" style={{ width: 28, height: 28 }}>
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
                    <div className="pat-avatar" style={{ width: 28, height: 28 }}>
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
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="bk-layout">
        <div>
          <div className="lq-board">
            <Column
              title="1. Waiting"
              sub="Patients waiting for token"
              icon={<ClockIcon />}
              cls="waiting"
              columnKind="waiting"
              cards={board?.waiting ?? []}
              selectedId={selectedCard?.appointment_id ?? null}
              onSelect={isToday ? (c) => setSelectedId(c.appointment_id) : undefined}
            />
            <Column title="2. With Doctor" sub="Patients currently with doctor" icon={<StethoscopeIcon />} cls="doctor" columnKind="doctor" cards={board?.withDoctor ?? []} />
            <Column title="3. In Pharmacy" sub="Patients in pharmacy / dispensing" icon={<PharmacyIcon />} cls="pharmacy" columnKind="pharmacy" cards={board?.inPharmacy ?? []} />
            <Column
              title="4. Completed Today"
              sub="Patients completed & billed"
              icon={<CheckCircleIcon />}
              cls="completed"
              columnKind="completed"
              cards={board?.completedToday ?? []}
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Upcoming Appointments (Next 3 Hours)</h3>
            </div>
            {(board?.upcoming.length ?? 0) === 0 ? (
              <div className="card-empty">No upcoming appointments in the next 3 hours.</div>
            ) : (
              <div className="pat-table-scroll">
                <table className="pat-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Patient</th>
                      <th>Patient ID</th>
                      <th>Doctor</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board!.upcoming.map((c) => (
                      <tr key={c.appointment_id}>
                        <td>{formatTime(c.scheduled_at)}</td>
                        <td>{c.patient_name}</td>
                        <td>
                          <span className="badge badge-blue">{c.patient_id}</span>
                        </td>
                        <td>Dr. {c.doctor_name}</td>
                        <td>{c.visit_type}</td>
                        <td>
                          <span className="badge badge-green">Scheduled</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="lq-upcoming-footer">
              <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
              <span>{isToday ? `Auto refresh in ${secondsToRefresh}s` : 'Viewing a non-today date — live actions disabled'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <UsersIcon /> Queue Summary
              </h3>
            </div>
            <div className="lq-summary-grid">
              <div className="lq-summary-item">
                <span className="label">
                  <UsersIcon /> Total in Queue
                </span>
                <span className="value">{totalInQueue}</span>
              </div>
              <div className="lq-summary-item">
                <span className="label">
                  <ClockIcon /> Waiting
                </span>
                <span className="value">{board?.waiting.length ?? 0}</span>
              </div>
              <div className="lq-summary-item">
                <span className="label">
                  <StethoscopeIcon /> With Doctor
                </span>
                <span className="value">{board?.withDoctor.length ?? 0}</span>
              </div>
              <div className="lq-summary-item">
                <span className="label">
                  <PharmacyIcon /> In Pharmacy
                </span>
                <span className="value">{board?.inPharmacy.length ?? 0}</span>
              </div>
              <div className="lq-summary-item">
                <span className="label">
                  <CheckCircleIcon /> Completed Today
                </span>
                <span className="value">{board?.completedToday.length ?? 0}</span>
              </div>
            </div>

            <div className="lq-next-token">
              <div className="lq-next-token-label">Next Token</div>
              {selectedCard ? (
                <>
                  <div className="lq-next-token-number">{selectedCard.token}</div>
                  <div className="lq-next-token-name">{selectedCard.patient_name}</div>
                  <div className="lq-next-token-sub">
                    {selectedCard.is_walk_in ? 'Walk-in' : selectedCard.visit_type} · {formatTime(selectedCard.scheduled_at)}
                  </div>
                </>
              ) : (
                <div className="lq-next-token-empty">No one is waiting to be called.</div>
              )}
              <button
                className="pat-btn primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                disabled={!selectedCard || selectedCard.status !== 'Waiting' || !isToday}
                onClick={handleCallNext}
              >
                <PhoneIcon /> Call Next
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Queue Controls</h3>
            </div>
            <div className="lq-controls-grid">
              <button className="lq-control-btn" disabled={!selectedCard || !isToday} onClick={() => selectedCard && setSkipTarget(selectedCard)}>
                <RefreshIcon /> Skip Token
              </button>
              <button className="lq-control-btn" disabled={(board?.skipped.length ?? 0) === 0 || !isToday} onClick={() => setRecallOpen((o) => !o)}>
                <RefreshIcon /> Recall Patient
              </button>
            </div>
            {recallOpen && (
              <div className="lq-recall-panel">
                {board?.skipped.length ? (
                  board.skipped.map((c) => (
                    <div
                      className="lq-recall-row"
                      key={c.appointment_id}
                      onClick={() => {
                        setRecallOpen(false);
                        setRecallTarget(c);
                      }}
                    >
                      <span>
                        #{c.token} {c.patient_name}
                      </span>
                      <span className="badge badge-red">Skipped</span>
                    </div>
                  ))
                ) : (
                  <div className="lq-recall-row">No skipped patients right now.</div>
                )}
              </div>
            )}
          </div>

          <div className="wi-note">
            <strong>
              <AlertIcon /> Please Note
            </strong>
            Click a card in the Waiting column to select it, then use Call Next or Skip Token above.
          </div>
        </div>
      </div>

      {skipTarget && <SkipReasonModal card={skipTarget} onClose={() => setSkipTarget(null)} onConfirm={handleSkip} />}
      {recallTarget && <RecallReasonModal card={recallTarget} onClose={() => setRecallTarget(null)} onConfirm={handleRecall} />}
    </div>
  );
};

export default LiveQueueBoard;
