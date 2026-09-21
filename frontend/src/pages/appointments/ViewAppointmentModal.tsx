import type { QueueAppointment } from '../../lib/appointments';
import { displayPatientName, displayPatientGender } from '../../lib/appointments';
import { CalendarIcon } from '../../components/layout/Icons';
import { formatDate, formatTime, appointmentCode, STATUS_BADGE } from './appointmentUtils';
import { calculateAge } from '../patients/patientUtils';

interface ViewAppointmentModalProps {
  appointment: QueueAppointment;
  onClose: () => void;
}

const ViewAppointmentModal = ({ appointment: a, onClose }: ViewAppointmentModalProps) => {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pat-view-header">
          <div className="pat-view-avatar">
            <CalendarIcon />
          </div>
          <div style={{ flex: 1 }}>
            <h3 className="modal-title" style={{ marginBottom: 2 }}>
              {displayPatientName(a)} {a.is_temporary && <span className="badge badge-amber">Temporary</span>}
            </h3>
            <p className="modal-subtitle" style={{ margin: 0 }}>
              {appointmentCode(a.appointment_id, a.scheduled_at)}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
        </div>

        <div className="pat-view-grid">
          <div className="pat-view-field">
            <span className="pat-view-label">Patient</span>
            <span className="pat-view-value">
              {displayPatientName(a)} · {a.patient?.dob ? `${calculateAge(a.patient.dob)} yrs` : a.temp_patient_age ? `~${a.temp_patient_age} yrs` : '—'} ·{' '}
              {displayPatientGender(a) ?? '—'}
            </span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Phone</span>
            <span className="pat-view-value">{a.patient?.phone ?? a.temp_patient_phone ?? '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Doctor</span>
            <span className="pat-view-value">Dr. {a.doctor.username}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Registration No.</span>
            <span className="pat-view-value">{a.doctor.registration_number || '—'}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Date</span>
            <span className="pat-view-value">{formatDate(a.scheduled_at)}</span>
          </div>
          <div className="pat-view-field">
            <span className="pat-view-label">Time</span>
            <span className="pat-view-value">{formatTime(a.scheduled_at)}</span>
          </div>
          <div className="pat-view-field span-2">
            <span className="pat-view-label">Reason for Visit</span>
            <span className="pat-view-value">{a.reason || '—'}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewAppointmentModal;
