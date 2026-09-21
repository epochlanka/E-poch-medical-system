import { useState } from 'react';
import type { FormEvent } from 'react';
import { updateAppointmentTime, displayPatientName } from '../../lib/appointments';
import type { QueueAppointment } from '../../lib/appointments';

interface RescheduleModalProps {
  appointment: QueueAppointment;
  onClose: () => void;
  onSaved: () => void;
}

const toDateInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const toTimeInput = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const RescheduleModal = ({ appointment, onClose, onSaved }: RescheduleModalProps) => {
  const [date, setDate] = useState(toDateInput(appointment.scheduled_at));
  const [time, setTime] = useState(toTimeInput(appointment.scheduled_at));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateAppointmentTime(appointment.appointment_id, new Date(`${date}T${time}`).toISOString());
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to reschedule.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Reschedule Appointment</h3>
        <p className="modal-subtitle">{displayPatientName(appointment)} with Dr. {appointment.doctor.username}</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field">
              <label>Date *</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Time *</label>
              <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RescheduleModal;
