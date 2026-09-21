import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createAppointment, listDoctors } from '../../lib/appointments';
import type { Doctor } from '../../lib/appointments';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import NewPatientModal from '../dashboard/NewPatientModal';
import { SearchIcon } from '../../components/layout/Icons';

interface NewAppointmentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const useClickOutside = (onOutside: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onOutside]);
  return ref;
};

const NewAppointmentModal = ({ onClose, onSuccess }: NewAppointmentModalProps) => {
  const [patientId, setPatientId] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const patientRef = useClickOutside(() => setPatientDropdownOpen(false));
  const [showQuickRegister, setShowQuickRegister] = useState(false);

  const [doctorId, setDoctorId] = useState('');
  const [doctorQuery, setDoctorQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const doctorRef = useClickOutside(() => setDoctorDropdownOpen(false));

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2 || patientQuery === patientId) return;
    const t = setTimeout(() => {
      listPatients({ search: patientQuery, status: 'active', limit: 20 }).then((res) => {
        setPatientResults(res.data);
        setPatientDropdownOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, patientId]);

  useEffect(() => {
    const t = setTimeout(() => {
      listDoctors(doctorQuery || undefined).then((res) => {
        setDoctorResults(res);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [doctorQuery]);

  const selectPatient = (p: Patient) => {
    setPatientId(p.patient_id);
    setPatientQuery(p.full_name);
    setPatientDropdownOpen(false);
  };

  const selectDoctor = (d: Doctor) => {
    setDoctorId(String(d.user_id));
    setDoctorQuery(d.username);
    setDoctorDropdownOpen(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!patientId || !doctorId || !date || !time) {
      setError('Select a patient, a doctor, and a date/time.');
      return;
    }
    setSubmitting(true);
    try {
      await createAppointment({
        patient_id: patientId,
        doctor_id: Number(doctorId),
        scheduled_at: new Date(`${date}T${time}`).toISOString(),
        reason: reason || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">New Appointment</h3>
        <p className="modal-subtitle">Book a patient in for a visit.</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-field span-2" ref={patientRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label>Patient *</label>
              <button type="button" className="card-link" onClick={() => setShowQuickRegister(true)}>
                + Quick Register
              </button>
            </div>
            <div className="pat-search" style={{ background: '#f8fafc' }}>
              <SearchIcon />
              <input
                placeholder="Search by name, ID, or phone…"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId('');
                }}
                onFocus={() => patientResults.length > 0 && setPatientDropdownOpen(true)}
                autoComplete="off"
              />
            </div>
            {patientDropdownOpen && (
              <div className="ph-search-results">
                {patientResults.length === 0 && <div className="ph-search-result">No patient found.</div>}
                {patientResults.map((p) => (
                  <button type="button" key={p.patient_id} className="ph-search-result" onClick={() => selectPatient(p)}>
                    <span>{p.full_name}</span>
                    <span className="pat-muted">{p.phone || p.patient_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-field span-2" ref={doctorRef} style={{ position: 'relative' }}>
            <label>Doctor *</label>
            <div className="pat-search" style={{ background: '#f8fafc' }}>
              <SearchIcon />
              <input
                placeholder="Search doctor by name…"
                value={doctorQuery}
                onChange={(e) => {
                  setDoctorQuery(e.target.value);
                  setDoctorId('');
                }}
                onFocus={() => setDoctorDropdownOpen(true)}
                autoComplete="off"
              />
            </div>
            {doctorDropdownOpen && (
              <div className="ph-search-results">
                {doctorResults.length === 0 && <div className="ph-search-result">No doctor found.</div>}
                {doctorResults.map((d) => (
                  <button type="button" key={d.user_id} className="ph-search-result" onClick={() => selectDoctor(d)}>
                    <span>Dr. {d.username}</span>
                    <span className="pat-muted">{d.registration_number || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-grid" style={{ marginTop: 14 }}>
            <div className="modal-field">
              <label>Date *</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Time *</label>
              <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="modal-field span-2">
              <label>Reason for visit</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fever & Headache" />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting || !patientId || !doctorId}>
              {submitting ? 'Booking…' : 'Book Appointment'}
            </button>
          </div>
        </form>
      </div>

      {showQuickRegister && (
        <NewPatientModal
          onClose={() => setShowQuickRegister(false)}
          onSuccess={(newId) => {
            setShowQuickRegister(false);
            setPatientId(newId);
            setPatientQuery(newId);
          }}
        />
      )}
    </div>
  );
};

export default NewAppointmentModal;
