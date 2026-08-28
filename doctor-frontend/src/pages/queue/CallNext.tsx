import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import {
  getLiveQueue,
  getQueueStats,
  listAppointments,
  updateAppointmentStatus,
  tokenNumber,
  waitingMinutes,
  displayPatientName,
  displayPatientId,
  displayPatientGender,
  displayAgeLabel,
} from '../../lib/queue';
import type { QueueAppointment } from '../../lib/queue';
import {
  PatientsIcon,
  ClockIcon,
  StethoscopeIcon,
  CheckCircleIcon,
  RefreshIcon,
  PhoneIcon,
  MegaphoneIcon,
  FilterIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import SkipModal from './SkipModal';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import './queue.css';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Re-renders periodically so waiting durations tick forward without a full refetch.
const useNow = (intervalMs: number) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
};

type StatusFilter = 'all' | 'waiting' | 'called';

const CallNext = () => {
  useNow(30000);
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [skipTarget, setSkipTarget] = useState<QueueAppointment | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: queue, loading, error, reload: reloadQueue } = useApiData(getLiveQueue);
  const { data: stats, reload: reloadStats } = useApiData(getQueueStats);
  const { data: skippedToday, reload: reloadSkipped } = useApiData(() =>
    listAppointments({ date: todayLocal(), status: 'Skipped', limit: 50 })
  );

  const refreshAll = () => {
    reloadQueue();
    reloadStats();
    reloadSkipped();
  };

  const waitingSorted = useMemo(
    () =>
      (queue ?? [])
        .filter((a) => a.status === 'Waiting')
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [queue]
  );
  const calledList = useMemo(() => (queue ?? []).filter((a) => a.status === 'Called'), [queue]);
  const firstWaitingId = waitingSorted[0]?.appointment_id;
  const nowCalling = calledList[0];

  const mostRecentSkipped = useMemo(() => {
    const rows = [...(skippedToday?.data ?? [])];
    rows.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    return rows[0];
  }, [skippedToday]);

  const allRows = useMemo(() => [...calledList, ...waitingSorted], [calledList, waitingSorted]);
  const filteredRows = statusFilter === 'all' ? allRows : statusFilter === 'called' ? calledList : waitingSorted;
  const visibleRows = showAllRows ? filteredRows : filteredRows.slice(0, 8);

  const runAction = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
      refreshAll();
    } finally {
      setBusyId(null);
    }
  };

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const waitClass = (mins: number) => (mins > 30 ? 'late' : mins > 15 ? 'warn' : 'ok');

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Call Next</h1>
          <p>Manage your queue and call the next patient for consultation.</p>
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

      {error && <div className="dash-error-banner">Couldn't load the queue: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total in Queue" value={String(stats?.totalInQueue ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Waiting &gt; 30 min" value={String(stats?.waitingOver30 ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<StethoscopeIcon />} iconBg="#fef3c7" iconColor="#b45309" label="In Consultation" value={String(stats?.inConsultation ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patient</span>} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Completed Today" value={String(stats?.completedToday ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Average Waiting Time" value={`${stats?.avgWaitingTimeMinutes ?? 0} min`} loading={!stats} />
      </div>

      <div className="q-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        <div className="pat-table-card">
          <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Queue List</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
              <FilterIcon />
              <select className="pat-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All Statuses</option>
                <option value="called">Called</option>
                <option value="waiting">Waiting</option>
              </select>
            </div>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Token No.</th>
                  <th>Patient Name</th>
                  <th>Age / Gender</th>
                  <th>Arrival Time</th>
                  <th>Waiting Time</th>
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
                {!loading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="pat-empty">No patients match this filter right now.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  visibleRows.map((a, i) => {
                    const mins = waitingMinutes(a.scheduled_at);
                    const isNext = a.appointment_id === firstWaitingId;
                    return (
                      <tr key={a.appointment_id} className={isNext ? 'q-row-next' : undefined}>
                        <td className="pat-muted">{i + 1}</td>
                        <td>
                          <span className={`q-token${isNext ? ' next' : ''}`}>{tokenNumber(a.appointment_id)}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {displayPatientName(a)} {a.is_temporary && <span className="badge badge-amber">Temporary</span>}
                          </div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            {displayPatientId(a)}
                          </span>
                        </td>
                        <td>
                          <span className={`q-gender-dot ${displayPatientGender(a) === 'Female' ? 'female' : 'male'}`} />
                          {displayAgeLabel(a) ?? '—'} {displayPatientGender(a) ? `/ ${displayPatientGender(a)}` : ''}
                        </td>
                        <td>{formatTime(a.scheduled_at)}</td>
                        <td className={`q-wait-time ${waitClass(mins)}`}>{mins} min</td>
                        <td>
                          {a.status === 'Waiting' && isNext ? (
                            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12.5 }}>Next</span>
                          ) : (
                            <span className={`badge ${a.status === 'Called' ? 'badge-blue' : 'badge-gray'}`}>{a.status}</span>
                          )}
                        </td>
                        <td>
                          {a.status === 'Called' ? (
                            <button
                              className="pat-btn primary"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              disabled={busyId === a.appointment_id}
                              onClick={async () => {
                                await runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Consulting'));
                                navigate(`/consultations/workspace/${a.appointment_id}`);
                              }}
                            >
                              Start Consultation
                            </button>
                          ) : isNext ? (
                            <button
                              className="pat-btn primary"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              disabled={busyId === a.appointment_id}
                              onClick={() => runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Called'))}
                            >
                              <PhoneIcon /> Call Next
                            </button>
                          ) : (
                            <button className="pat-btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setSkipTarget(a)}>
                              Skip
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 8 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {visibleRows.length} of {filteredRows.length} patients
              </div>
              <button className="card-link" onClick={() => setShowAllRows((v) => !v)}>
                {showAllRows ? 'Show fewer' : 'View All'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {nowCalling ? (
            <div className="q-now-card">
              <div className="q-now-header">NOW CALLING</div>
              <div className="q-now-top">
                <div>
                  <div className="q-now-label">Token No.</div>
                  <div className="q-now-token-big">{tokenNumber(nowCalling.appointment_id)}</div>
                </div>
                <div className="q-now-avatar">{initials(displayPatientName(nowCalling))}</div>
              </div>
              <div className="q-now-row">
                <span className="q-now-label">Patient</span>
                <span className="q-now-value">
                  {displayPatientName(nowCalling)} {nowCalling.is_temporary && <span className="badge badge-amber">Temporary</span>}
                </span>
              </div>
              <div className="q-now-row">
                <span className="q-now-label">MRN</span>
                <span className="q-now-value">{displayPatientId(nowCalling)}</span>
              </div>
              <div className="q-now-stats">
                <div className="q-now-stat-box">
                  <div className="q-now-stat-label">Arrival Time</div>
                  <div className="q-now-stat-value">{formatTime(nowCalling.scheduled_at)}</div>
                </div>
                <div className="q-now-stat-box">
                  <div className="q-now-stat-label">Waiting Time</div>
                  <div className="q-now-stat-value">{waitingMinutes(nowCalling.scheduled_at)} min</div>
                </div>
              </div>
              <div className="q-now-message">
                <MegaphoneIcon /> Please send the patient in for consultation.
              </div>
            </div>
          ) : (
            <div className="q-now-card empty">No patient is currently being called.</div>
          )}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Queue Controls</h3>
            </div>
            <div className="q-controls">
              <button
                className="q-control-btn primary"
                disabled={!firstWaitingId || busyId !== null}
                onClick={() => firstWaitingId && runAction(firstWaitingId, () => updateAppointmentStatus(firstWaitingId, 'Called'))}
              >
                <PhoneIcon /> Call Next Patient
              </button>
              <button
                className="q-control-btn"
                disabled={(!nowCalling && !waitingSorted[0]) || busyId !== null}
                onClick={() => setSkipTarget(nowCalling ?? waitingSorted[0])}
              >
                Skip Patient
              </button>
              <button
                className="q-control-btn"
                disabled={!mostRecentSkipped || busyId !== null}
                onClick={() =>
                  mostRecentSkipped && runAction(mostRecentSkipped.appointment_id, () => updateAppointmentStatus(mostRecentSkipped.appointment_id, 'Waiting'))
                }
              >
                <RefreshIcon /> Recall Patient
              </button>
              <button className="q-control-btn" onClick={refreshAll}>
                <RefreshIcon /> Refresh Queue
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Queue Summary</h3>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Total in Queue</span>
              <span className="q-summary-value">{stats?.totalInQueue ?? 0}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Waiting &gt; 30 min</span>
              <span className="q-summary-value warn">{stats?.waitingOver30 ?? 0}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Average Waiting Time</span>
              <span className="q-summary-value">{stats?.avgWaitingTimeMinutes ?? 0} min</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Longest Waiting Time</span>
              <span className="q-summary-value warn">{stats?.longestWaitingTimeMinutes ?? 0} min</span>
            </div>
          </div>
        </div>
      </div>

      <div className="q-tip-bar">Tip: use "Call Next Patient" to move the next waiting patient into consultation.</div>

      {skipTarget && (
        <SkipModal
          appointment={skipTarget}
          onClose={() => setSkipTarget(null)}
          onSkipped={() => {
            setSkipTarget(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default CallNext;
