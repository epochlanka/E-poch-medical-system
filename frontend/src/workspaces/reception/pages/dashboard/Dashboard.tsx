import { useMemo } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../../../app/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getReceptionistDashboard } from '../../lib/dashboard';
import {
  PatientsIcon,
  UserPlusIcon,
  DollarIcon,
  ClockIcon,
  CalendarIcon,
  RefreshIcon,
  SearchIcon,
  PlusIcon,
  ChevronRightIcon,
  StethoscopeIcon,
  PharmacyIcon,
  CheckCircleIcon,
} from '../../components/layout/Icons';
import '../../styles/shared.css';
import './dashboard.css';
import './reception-dashboard.css';

const currency = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: dash, loading, error, reload } = useApiData(getReceptionistDashboard);

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' });
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const waitingPatients = useMemo(
    () =>
      (dash?.todaysQueue ?? [])
        .filter((patient) => patient.status === 'Waiting')
        .sort((a, b) => (b.waitTimeMinutes ?? 0) - (a.waitTimeMinutes ?? 0))
        .slice(0, 6),
    [dash],
  );

  const flowSteps = [
    { label: 'Waiting to be seen', value: dash?.queueCounts.waiting ?? 0, hint: 'Reception action', icon: <ClockIcon />, tone: 'waiting' },
    { label: 'With a doctor', value: dash?.queueCounts.withDoctor ?? 0, hint: 'Consultation in progress', icon: <StethoscopeIcon />, tone: 'doctor' },
    { label: 'At the pharmacy', value: dash?.queueCounts.withPharmacy ?? 0, hint: 'Prescription being prepared', icon: <PharmacyIcon />, tone: 'pharmacy' },
    { label: 'Finished today', value: dash?.queueCounts.completed ?? 0, hint: 'Visit completed', icon: <CheckCircleIcon />, tone: 'complete' },
  ];

  return (
    <div className="reception-home">
      <div className="dash-header reception-home-header">
        <div>
          <span className="reception-eyebrow">{dateLabel}</span>
          <h1>{greeting}, {user?.username ?? 'Receptionist'}</h1>
          <p>Start with the patient in front of you, or check who is waiting.</p>
        </div>
        <button className="pat-icon-btn" onClick={reload} aria-label="Refresh dashboard" title="Refresh dashboard">
          <RefreshIcon />
        </button>
      </div>

      {error && <div className="dash-error-banner">Couldn’t load the front desk: {error}</div>}

      <section aria-labelledby="front-desk-actions">
        <div className="reception-section-heading">
          <div>
            <h2 id="front-desk-actions">What do you need to do?</h2>
            <p>Choose the action that matches the patient’s situation.</p>
          </div>
        </div>
        <div className="reception-primary-actions">
          <button className="reception-action-card register" onClick={() => navigate('/patients/register')}>
            <span className="reception-action-icon"><UserPlusIcon /></span>
            <span><strong>Register a new patient</strong><small>Create their patient record first</small></span>
            <ChevronRightIcon />
          </button>
          <button className="reception-action-card appointment" onClick={() => navigate('/appointments/book')}>
            <span className="reception-action-icon"><CalendarIcon /></span>
            <span><strong>Book an appointment</strong><small>Choose a doctor, date and time</small></span>
            <ChevronRightIcon />
          </button>
          <button className="reception-action-card walkin" onClick={() => navigate('/appointments/walk-in')}>
            <span className="reception-action-icon"><PlusIcon /></span>
            <span><strong>Add a walk-in</strong><small>Place today’s patient in the waiting line</small></span>
            <ChevronRightIcon />
          </button>
        </div>
      </section>

      <section className="reception-flow-section" aria-labelledby="patient-flow-heading">
        <div className="reception-section-heading">
          <div>
            <h2 id="patient-flow-heading">Today’s patient flow</h2>
            <p>A patient moves from left to right through these four stages.</p>
          </div>
          <button className="card-link reception-open-flow" onClick={() => navigate('/queue/live')}>Open patient flow <ChevronRightIcon /></button>
        </div>
        <button className="reception-flow-strip" onClick={() => navigate('/queue/live')} aria-label="Open today’s patient flow">
          {flowSteps.map((step, index) => (
            <span className={`reception-flow-step ${step.tone}`} key={step.label}>
              <span className="reception-flow-icon">{step.icon}</span>
              <span className="reception-flow-copy"><strong>{loading ? '—' : step.value}</strong><span>{step.label}</span><small>{step.hint}</small></span>
              {index < flowSteps.length - 1 && <span className="reception-flow-arrow">→</span>}
            </span>
          ))}
        </button>
      </section>

      <div className="reception-work-grid">
        <section className="card reception-attention-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Waiting now</h2>
              <p className="card-subtitle">Longest-waiting patients are shown first.</p>
            </div>
            <span className="reception-count-badge">{loading ? 'Counting\u2026' : `${dash?.queueCounts.waiting ?? 0} waiting`}</span>
          </div>
          {loading && <div className="card-empty">Loading patients…</div>}
          {!loading && waitingPatients.length === 0 && (
            <div className="reception-clear-state"><CheckCircleIcon /><strong>No patients are waiting</strong><span>The waiting line is clear right now.</span></div>
          )}
          {!loading && waitingPatients.length > 0 && (
            <div className="reception-waiting-list">
              {waitingPatients.map((patient) => (
                <button key={patient.appointmentId} className="reception-waiting-row" onClick={() => navigate('/queue/live')}>
                  <span className="reception-token">{patient.token}</span>
                  {patient.photoUrl ? <img className="pat-avatar" src={patient.photoUrl} alt="" /> : <span className="pat-avatar">{initials(patient.patientName)}</span>}
                  <span className="reception-waiting-person"><strong>{patient.patientName}</strong><small>{patient.type} · Dr. {patient.doctorName}</small></span>
                  <span className={`reception-wait-time ${(patient.waitTimeMinutes ?? 0) >= 30 ? 'late' : ''}`}>
                    {patient.waitTimeMinutes !== null ? `${patient.waitTimeMinutes} min` : 'Just added'}
                  </span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          )}
          {waitingPatients.length > 0 && <button className="reception-full-width-link" onClick={() => navigate('/queue/live')}>Manage waiting patients</button>}
        </section>

        <section className="card reception-schedule-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Doctor schedule today</h2>
              <p className="card-subtitle">What is currently running and coming next.</p>
            </div>
            <button className="card-link" onClick={() => navigate('/appointments/book')}>Book</button>
          </div>
          {loading && <div className="card-empty">Loading schedule…</div>}
          {!loading && (dash?.todaysSchedule.length ?? 0) === 0 && <div className="card-empty">No appointments scheduled today.</div>}
          {dash?.todaysSchedule.slice(0, 6).map((slot, index) => (
            <div className="rcp-schedule-row" key={`${slot.time}-${slot.doctorId}-${index}`}>
              <span className={`rcp-schedule-dot ${slot.status === 'In Progress' ? 'in-progress' : 'upcoming'}`} />
              <span className="rcp-schedule-time">{slot.time}</span>
              <div className="rcp-schedule-info">
                <div className="rcp-schedule-doctor">Dr. {slot.doctorName}</div>
                <span className="rcp-schedule-count">{slot.appointmentCount} patient{slot.appointmentCount === 1 ? '' : 's'}</span>
              </div>
              <span className={`badge ${slot.status === 'In Progress' ? 'badge-green' : 'badge-blue'}`}>{slot.status}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="reception-day-summary" aria-label="Today’s summary">
        <div><PatientsIcon /><span><strong>{dash?.kpis.todaysAppointmentsTotal ?? 0}</strong> appointments today</span></div>
        <div><UserPlusIcon /><span><strong>{dash?.kpis.walkInPatientsToday ?? 0}</strong> walk-ins added</span></div>
        <div><DollarIcon /><span><strong>{currency(dash?.kpis.totalCollectionsToday ?? 0)}</strong> collected</span></div>
        <button onClick={() => navigate('/patients/all')}><SearchIcon /> Find a patient</button>
      </section>
    </div>
  );
};

export default Dashboard;
