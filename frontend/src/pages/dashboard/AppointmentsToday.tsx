import { useApiData } from '../../hooks/useApiData';
import { getQueueSnapshot } from '../../lib/dashboard';
import type { AppointmentSummary } from '../../lib/dashboard';

const STATUS_BADGE: Record<AppointmentSummary['status'], string> = {
  Waiting: 'badge-amber',
  Called: 'badge-blue',
  Consulting: 'badge-purple',
  Completed: 'badge-green',
  Skipped: 'badge-gray',
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const AppointmentsToday = () => {
  const { data, loading, error } = useApiData(getQueueSnapshot);
  const appointments = data?.appointmentsToday ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Appointments Today</h3>
          {!loading && !error && <div className="card-subtitle">{appointments.length} scheduled</div>}
        </div>
      </div>

      {loading && <div className="card-empty">Loading…</div>}
      {error && <div className="card-empty">{error}</div>}
      {!loading && !error && appointments.length === 0 && <div className="card-empty">No appointments scheduled today.</div>}

      {appointments.slice(0, 6).map((a) => (
        <div className="appt-row" key={a.appointmentId}>
          <span className="appt-time">{formatTime(a.scheduledAt)}</span>
          <div className="appt-avatar">{initials(a.patientName)}</div>
          <div className="appt-info">
            <div className="appt-name">{a.patientName}</div>
            <div className="appt-mrn">{a.patientId}</div>
          </div>
          <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
        </div>
      ))}
    </div>
  );
};

export default AppointmentsToday;
