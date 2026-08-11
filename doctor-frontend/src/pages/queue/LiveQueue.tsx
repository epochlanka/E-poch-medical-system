import { useEffect, useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import {
  getLiveQueue,
  getQueueStats,
  listAppointments,
  updateAppointmentStatus,
  tokenNumber,
  calculateAge,
  waitingMinutes,
} from '../../lib/queue';
import type { QueueAppointment, AppointmentStatus } from '../../lib/queue';
import { PatientsIcon, ClockIcon, StethoscopeIcon, CheckCircleIcon, RefreshIcon, PhoneIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import SkipModal from './SkipModal';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import './queue.css';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  Waiting: 'badge-gray',
  Called: 'badge-blue',
  Consulting: 'badge-amber',
  Completed: 'badge-green',
  Skipped: 'badge-red',
  Cancelled: 'badge-red',
  'No Show': 'badge-red',
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Re-renders periodically so waiting/consulting durations tick forward without a full refetch.
const useNow = (intervalMs: number) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
};

type Tab = 'live' | 'called' | 'skipped' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'live', label: 'Live Queue' },
  { key: 'called', label: 'Called History' },
  { key: 'skipped', label: 'Skipped / Recalled' },
  { key: 'all', label: 'All Appointments' },
];

const LiveQueue = () => {
  useNow(30000);
  const [activeTab, setActiveTab] = useState<Tab>('live');
  const [skipTarget, setSkipTarget] = useState<QueueAppointment | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: queue, loading, error, reload: reloadQueue } = useApiData(getLiveQueue);
  const { data: stats, reload: reloadStats } = useApiData(getQueueStats);
  const { data: todaysList, reload: reloadToday } = useApiData(
    () => listAppointments({ date: todayLocal(), limit: 100 }),
    [activeTab]
  );

  const refreshAll = () => {
    reloadQueue();
    reloadStats();
    reloadToday();
  };

  const waitingSorted = useMemo(
    () => (queue ?? []).filter((a) => a.status === 'Waiting').sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [queue]
  );
  const calledList = useMemo(() => (queue ?? []).filter((a) => a.status === 'Called'), [queue]);
  const consultingEntry = useMemo(() => (queue ?? []).find((a) => a.status === 'Consulting'), [queue]);
  const firstWaitingId = waitingSorted[0]?.appointment_id;

  const visibleRows = showAllRows ? [...calledList, ...waitingSorted] : [...calledList, ...waitingSorted].slice(0, 8);
  const totalRows = calledList.length + waitingSorted.length;

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
          <h1>Live Queue</h1>
          <p>Real-time patient queue for your consultations.</p>
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

      <div className="q-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`q-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="dash-error-banner">Couldn't load the queue: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total in Queue" value={String(stats?.totalInQueue ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Waiting &gt; 30 min" value={String(stats?.waitingOver30 ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<StethoscopeIcon />} iconBg="#fef3c7" iconColor="#b45309" label="In Consultation" value={String(stats?.inConsultation ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patient</span>} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Completed Today" value={String(stats?.completedToday ?? 0)} loading={!stats} footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Patients</span>} />
        <KpiCard icon={<ClockIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Avg. Waiting Time" value={`${stats?.avgWaitingTimeMinutes ?? 0} min`} loading={!stats} />
      </div>

      {activeTab === 'live' ? (
        <div className="q-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
          <div className="pat-table-card">
            <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Current Queue</h3>
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
                        <div className="pat-empty">No patients waiting or called right now.</div>
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    visibleRows.map((a, i) => {
                      const mins = waitingMinutes(a.scheduled_at);
                      const isNext = a.appointment_id === firstWaitingId;
                      return (
                        <tr key={a.appointment_id} style={isNext ? { background: '#f0fdf4' } : undefined}>
                          <td className="pat-muted">{i + 1}</td>
                          <td>
                            <span className={`q-token${isNext ? ' next' : ''}`}>{tokenNumber(a.appointment_id)}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.patient.full_name}</div>
                            <span className="pat-muted" style={{ fontSize: 11.5 }}>
                              {a.patient.patient_id}
                            </span>
                          </td>
                          <td>
                            {calculateAge(a.patient.dob)} Y / {a.patient.gender}
                          </td>
                          <td>{formatTime(a.scheduled_at)}</td>
                          <td className={`q-wait-time ${waitClass(mins)}`}>{mins} min</td>
                          <td>
                            {a.status === 'Waiting' && isNext ? (
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 12.5 }}>Next</span>
                            ) : (
                              <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                            )}
                          </td>
                          <td>
                            {a.status === 'Called' ? (
                              <button
                                className="pat-btn primary"
                                style={{ fontSize: 12, padding: '6px 12px' }}
                                disabled={busyId === a.appointment_id}
                                onClick={() => runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Consulting'))}
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
            {totalRows > 8 && (
              <div className="pat-pagination">
                <div className="pat-pagination-info">
                  Showing {visibleRows.length} of {totalRows} patients
                </div>
                <button className="card-link" onClick={() => setShowAllRows((v) => !v)}>
                  {showAllRows ? 'Show fewer' : 'View All'}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {consultingEntry ? (
              <div className="q-now-card">
                <div className="q-now-header">NOW IN CONSULTATION</div>
                <div className="q-now-row">
                  <span className="q-now-label">Token No.</span>
                  <span className="q-token next">{tokenNumber(consultingEntry.appointment_id)}</span>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">Patient</span>
                  <span className="q-now-value">{consultingEntry.patient.full_name}</span>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">MRN</span>
                  <span className="q-now-value">{consultingEntry.patient.patient_id}</span>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">Since</span>
                  <span className="q-now-value">{formatTime(consultingEntry.consultation?.created_at ?? consultingEntry.scheduled_at)}</span>
                </div>
                <div className="q-now-row">
                  <span className="q-now-label">Duration</span>
                  <span className="q-now-value" style={{ color: '#16a34a' }}>
                    {waitingMinutes(consultingEntry.consultation?.created_at ?? consultingEntry.scheduled_at)} min
                  </span>
                </div>
              </div>
            ) : (
              <div className="q-now-card empty">No patient currently in consultation.</div>
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
                  disabled={!calledList[0] && !waitingSorted[0]}
                  onClick={() => setSkipTarget(calledList[0] ?? waitingSorted[0])}
                >
                  Skip Patient
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
      ) : (
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Token No.</th>
                  <th>Patient Name</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  {activeTab === 'skipped' && <th>Reason</th>}
                  {activeTab === 'skipped' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {!todaysList && (
                  <tr>
                    <td colSpan={7} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {todaysList &&
                  (() => {
                    const rows = todaysList.data.filter((a) => {
                      if (activeTab === 'called') return ['Called', 'Consulting', 'Completed'].includes(a.status);
                      if (activeTab === 'skipped') return a.status === 'Skipped';
                      return true;
                    });
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7}>
                            <div className="pat-empty">Nothing here today.</div>
                          </td>
                        </tr>
                      );
                    }
                    return rows.map((a) => (
                      <tr key={a.appointment_id}>
                        <td>
                          <span className="q-token">{tokenNumber(a.appointment_id)}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{a.patient.full_name}</div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            {a.patient.patient_id}
                          </span>
                        </td>
                        <td>{formatDate(a.scheduled_at)}</td>
                        <td>{formatTime(a.scheduled_at)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                        </td>
                        {activeTab === 'skipped' && <td className="pat-muted">{a.skip_reason || '—'}</td>}
                        {activeTab === 'skipped' && (
                          <td>
                            <button
                              className="pat-btn"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              disabled={busyId === a.appointment_id}
                              onClick={() => runAction(a.appointment_id, () => updateAppointmentStatus(a.appointment_id, 'Waiting'))}
                            >
                              <RefreshIcon /> Recall
                            </button>
                          </td>
                        )}
                      </tr>
                    ));
                  })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

export default LiveQueue;
