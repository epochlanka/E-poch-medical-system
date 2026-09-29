import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDoctors,
  getQueueBoard,
  updateAppointmentStatus,
  skipAppointment,
  convertToPatient,
} from '../../lib/appointments';
import type { Doctor, BoardCard, QueueBoard } from '../../lib/appointments';
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
  XCircleIcon,
  MegaphoneIcon,
  UserPlusIcon,
} from '../../components/layout/Icons';
import NewPatientModal from '../patients/NewPatientModal';
import { initials, calculateAge } from '../patients/patientUtils';
import { CONSULTATION_TYPES } from './appointmentUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './bookAppointment.css';
import './walkIn.css';
import './liveQueue.css';
import Modal from '../../components/Modal';

const REFRESH_SECONDS = 30;
const PREVIEW_COUNT = 4;

const SKIP_QUICK_REASONS = ['Not responding when called', 'Stepped out / not in waiting area', 'Requested to be seen later'];

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// A temporary/unregistered walk-in has no dob (only an optional approximate age) and no
// patient_id — these two helpers keep every render/export site consistent about the fallback.
const ageLabel = (card: BoardCard) => {
  if (card.dob) return `${calculateAge(card.dob)} Y`;
  if (card.temp_patient_age != null) return `~${card.temp_patient_age} Y`;
  return 'Age —';
};
const patientIdLabel = (card: BoardCard) => card.patient_id ?? (card.is_temporary ? 'Temporary' : '—');

const toCsv = (rows: { column: string; card: BoardCard }[]) => {
  const header = ['Token', 'Column', 'Patient', 'Patient ID', 'Age', 'Gender', 'Doctor', 'Type', 'Status', 'Time'];
  const body = rows.map(({ column, card }) => [
    String(card.token),
    column,
    card.patient_name,
    patientIdLabel(card),
    ageLabel(card),
    card.gender ?? '—',
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
    <Modal onClose={onClose} maxWidth={420}>
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
    </Modal>
  );
};

const RECALL_QUICK_REASONS = ['Patient returned', 'Called back after urgent case', 'Ready now'];

const RecallReasonModal = ({ card, onClose, onConfirm }: { card: BoardCard; onClose: () => void; onConfirm: (reason: string) => void }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal onClose={onClose} maxWidth={420}>
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
    </Modal>
  );
};

const Card = ({ card, column, selected, onClick }: { card: BoardCard; column: 'waiting' | 'doctor' | 'pharmacy' | 'completed'; selected?: boolean; onClick?: () => void }) => {
  return (
    // Only the Waiting column is selectable; the rest must not look clickable.
    <div className={`lq-card${selected ? ' selected' : ''}${onClick ? '' : ' static'}`} onClick={onClick}>
      <div className="lq-card-top">
        <span className="lq-card-token">{card.token}</span>
        {/* The name owns this line. Sharing it with the patient ID truncated real names to
            "Nimal Pe…" at four columns wide, so the ID moved down to the detail line. */}
        <span className="lq-card-name">{card.patient_name}</span>
        {card.is_temporary && <span className="lq-temp-badge">Temporary</span>}
      </div>
      <div className="lq-card-sub">
        {[card.patient_id, ageLabel(card), card.gender].filter(Boolean).join(' · ')}
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
  loaded,
  selectedId,
  onSelect,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  cls: 'waiting' | 'doctor' | 'pharmacy' | 'completed';
  cards: BoardCard[];
  columnKind: 'waiting' | 'doctor' | 'pharmacy' | 'completed';
  loaded: boolean;
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
        <span className="lq-column-count">{loaded ? cards.length : '\u2014'}</span>
      </div>
      <div className="lq-column-sub">{sub}</div>
      {visible.length === 0 && <div className="lq-column-empty">{loaded ? 'No patients here.' : 'Loading\u2026'}</div>}
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
  const [registerTarget, setRegisterTarget] = useState<BoardCard | null>(null);

  const fetchBoard = useCallback(async (background = false) => {
    setLoading(true);
    try {
      const data = await getQueueBoard({ doctorId: doctorFilter?.user_id, consultationType: consultationType || undefined, date: date || undefined }, background);
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
    const t = setInterval(() => fetchBoard(true), REFRESH_SECONDS * 1000);
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
  const explicitCard = selectedId ? board?.waiting.find((c) => c.appointment_id === selectedId) ?? null : null;
  const selectedCard = explicitCard ?? dueWaiting[0] ?? board?.waiting[0] ?? null;
  // Call Next / Skip act on selectedCard even when nobody clicked anything, so the panel has to
  // distinguish "the one you picked" from "the one we picked for you".
  const autoSelected = !explicitCard;

  // Until the first response lands there is no count to show; a literal 0 reads as "nobody is
  // waiting", which is the one thing a front desk must not be told by mistake.
  const loaded = !!board;

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

  // Bridges a temporary/unregistered walk-in back to a permanent Patient — required before this
  // visit can be billed (Invoice.patient_id is a hard FK; see billing/service.ts's createInvoice
  // guard). NewPatientModal creates the Patient row; convertToPatient re-points this appointment
  // at it, clearing is_temporary server-side.
  const handleRegistered = (patientId: string) => {
    if (!registerTarget) return;
    runAction(() => convertToPatient(registerTarget.appointment_id, patientId)).then(() => setRegisterTarget(null));
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
            <span style={{ marginRight: 8, color: 'var(--accent)', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Today’s patient flow
          </h1>
          <p>See where every patient is now and manage the people waiting to be seen.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => fetchBoard()} disabled={loading}>
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
          <label>Visit type</label>
          <select value={consultationType} onChange={(e) => setConsultationType(e.target.value)}>
            <option value="">All Types</option>
            {CONSULTATION_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="modal-field">
          <label>Doctor</label>
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

      {/* Viewing another day silently disables every action on this screen. That used to be
          stated only in small print under the table at the bottom of the page. */}
      {!isToday && (
        <div className="lq-past-banner" role="status">
          <AlertIcon />
          <span>
            <strong>You are viewing {new Date(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.</strong> Calling,
            skipping and recalling are turned off for any day but today.
          </span>
          <button className="pat-btn" onClick={() => setDate(todayStr())}>
            Back to today
          </button>
        </div>
      )}

      <div className="bk-layout">
        <div>
          <div className="lq-board">
            <Column
              title="1. Waiting"
              sub="Waiting to be called"
              icon={<ClockIcon />}
              cls="waiting"
              columnKind="waiting"
              cards={board?.waiting ?? []}
              loaded={loaded}
              selectedId={selectedCard?.appointment_id ?? null}
              onSelect={isToday ? (c) => setSelectedId(c.appointment_id) : undefined}
            />
            <Column title="2. With the doctor" sub="In the consultation room" icon={<StethoscopeIcon />} cls="doctor" columnKind="doctor" cards={board?.withDoctor ?? []} loaded={loaded} />
            <Column title="3. At the pharmacy" sub="Collecting medicine" icon={<PharmacyIcon />} cls="pharmacy" columnKind="pharmacy" cards={board?.inPharmacy ?? []} loaded={loaded} />
            <Column
              title="4. Finished today"
              sub="Finished and billed"
              icon={<CheckCircleIcon />}
              cls="completed"
              columnKind="completed"
              cards={board?.completedToday ?? []}
              loaded={loaded}
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
              <span>{isToday ? `Auto refresh in ${secondsToRefresh}s` : 'Auto refresh is off for past dates'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* The Queue Summary card that used to sit here repeated the four column counts
              verbatim; the board already shows them. What is left is the one thing the rail is
              for: who is next, and what you can do to them. */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <UsersIcon /> Next patient
              </h3>
            </div>

            <div className="lq-next-token">
              <div className="lq-next-token-label">
                {selectedCard ? (autoSelected ? 'Next Token · first in line' : 'Next Token · you selected this') : 'Next Token'}
              </div>
              {selectedCard ? (
                <>
                  <div className="lq-next-token-number">{selectedCard.token}</div>
                  <div className="lq-next-token-name">
                    {selectedCard.patient_name} {selectedCard.is_temporary && <span className="lq-temp-badge">Temporary</span>}
                  </div>
                  <div className="lq-next-token-sub">
                    {selectedCard.is_walk_in ? 'Walk-in' : selectedCard.visit_type} · {formatTime(selectedCard.scheduled_at)}
                  </div>
                </>
              ) : (
                <div className="lq-next-token-empty">No one is waiting to be called.</div>
              )}
              {selectedCard && (
                <p className="lq-next-token-hint">
                  Call Next and Skip Token below act on this patient. Click any card in the Waiting column to act on someone else
                  {!autoSelected && <> — <button type="button" className="lq-next-token-reset" onClick={() => setSelectedId(null)}>back to first in line</button></>}.
                </p>
              )}
              <button
                className="pat-btn primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                disabled={!selectedCard || selectedCard.status !== 'Waiting' || !isToday}
                onClick={handleCallNext}
              >
                <PhoneIcon /> Call Next
              </button>
              {selectedCard?.is_temporary && (
                <button
                  className="pat-btn"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                  onClick={() => setRegisterTarget(selectedCard)}
                >
                  <UserPlusIcon /> Register Patient
                </button>
              )}
            </div>

            <div className="lq-controls-grid">
              <button className="lq-control-btn" disabled={!selectedCard || !isToday} onClick={() => selectedCard && setSkipTarget(selectedCard)}>
                <XCircleIcon /> Skip {selectedCard ? `#${selectedCard.token}` : 'Token'}
              </button>
              <button className="lq-control-btn" disabled={(board?.skipped.length ?? 0) === 0 || !isToday} onClick={() => setRecallOpen((o) => !o)}>
                <MegaphoneIcon /> Recall Patient{board?.skipped.length ? ` (${board.skipped.length})` : ''}
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

        </div>
      </div>

      {skipTarget && <SkipReasonModal card={skipTarget} onClose={() => setSkipTarget(null)} onConfirm={handleSkip} />}
      {recallTarget && <RecallReasonModal card={recallTarget} onClose={() => setRecallTarget(null)} onConfirm={handleRecall} />}
      {registerTarget && <NewPatientModal onClose={() => setRegisterTarget(null)} onSuccess={handleRegistered} />}
    </div>
  );
};

export default LiveQueueBoard;
