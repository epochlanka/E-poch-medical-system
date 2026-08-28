import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getLiveQueue, updateAppointmentStatus, displayPatientName, displayPatientGender } from '../../lib/appointments';
import { listConsultations } from '../../lib/consultations';
import { StethoscopeIcon, ClockIcon, ChevronRightIcon } from '../../components/layout/Icons';
import { calculateAge, formatDateTime } from './consultationUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './consultation.css';

const STATUS_BADGE: Record<string, string> = {
  Waiting: 'badge-gray',
  Called: 'badge-amber',
  Consulting: 'badge-green',
  Draft: 'badge-amber',
  Finalized: 'badge-green',
};

const ConsultationsQueue = () => {
  const navigate = useNavigate();
  const { data: queue, loading: queueLoading, reload: reloadQueue } = useApiData(getLiveQueue);
  const { data: recent, loading: recentLoading } = useApiData(() => listConsultations({ limit: 10 }));

  const active = (queue ?? []).filter((a) => a.status === 'Called' || a.status === 'Consulting').sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const handleOpen = async (appointmentId: number, status: string) => {
    if (status === 'Called') {
      await updateAppointmentStatus(appointmentId, 'Consulting');
      reloadQueue();
    }
    navigate(`/consultations/${appointmentId}`);
  };

  return (
    <div>
      <div className="cons-header">
        <div>
          <h1>Consultations</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Patients ready for consultation, and recent visit records.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Ready for Consultation</h3>
        </div>
        {queueLoading && <p className="card-subtitle">Loading…</p>}
        {!queueLoading && active.length === 0 && <div className="card-empty">No patients called or in consultation right now.</div>}
        {active.map((a) => (
          <div className="appt-row" key={a.appointment_id}>
            <span className="appt-time">{new Date(a.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="appt-avatar">{displayPatientName(a).slice(0, 2).toUpperCase()}</div>
            <div className="appt-info">
              <div className="appt-name">
                {displayPatientName(a)} {a.is_temporary && <span className="badge badge-amber">Temporary</span>}
              </div>
              <div className="appt-mrn">
                {displayPatientGender(a) ?? '—'}, {a.patient?.dob ? `${calculateAge(a.patient.dob)} yrs` : a.temp_patient_age ? `~${a.temp_patient_age} yrs` : '—'} · Dr. {a.doctor.username}
              </div>
            </div>
            <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
            <button className="cons-btn primary" style={{ marginLeft: 12 }} onClick={() => handleOpen(a.appointment_id, a.status)}>
              <StethoscopeIcon /> {a.status === 'Consulting' ? 'Open Consultation' : 'Start Consultation'}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Consultations</h3>
        </div>
        {recentLoading && <p className="card-subtitle">Loading…</p>}
        {!recentLoading && recent?.data.length === 0 && <div className="card-empty">No consultations recorded yet.</div>}
        {recent?.data.map((c) => (
          <button
            className="appt-row"
            key={c.consultationId}
            onClick={() => navigate(`/consultations/${c.appointmentId}`)}
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
          >
            <span className="rx-icon">
              <ClockIcon />
            </span>
            <div className="appt-info">
              <div className="appt-name">
                {c.patientName} {c.diagnosis ? `— ${c.diagnosis}` : ''}
              </div>
              <div className="appt-mrn">
                Dr. {c.doctorName} · {formatDateTime(c.createdAt)}
              </div>
            </div>
            <span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
            <ChevronRightIcon />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ConsultationsQueue;
