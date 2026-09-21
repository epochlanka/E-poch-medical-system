import { useState } from 'react';
import type { FormEvent } from 'react';
import { updatePatient } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { BLOOD_GROUPS } from './patientUtils';

interface EditPatientModalProps {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
}

const EditPatientModal = ({ patient, onClose, onSaved }: EditPatientModalProps) => {
  const [form, setForm] = useState({
    full_name: patient.full_name,
    gender: patient.gender,
    phone: patient.phone ?? '',
    blood_group: patient.blood_group ?? '',
    allergies: patient.allergies ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updatePatient(patient.patient_id, {
        full_name: form.full_name,
        gender: form.gender,
        phone: form.phone || undefined,
        blood_group: form.blood_group || undefined,
        allergies: form.allergies || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to update patient.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Patient</h3>
        <p className="modal-subtitle">
          {patient.patient_id} · {patient.family.family_name}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Full name *</label>
              <input required value={form.full_name} onChange={set('full_name')} />
            </div>
            <div className="modal-field">
              <label>Gender *</label>
              <select required value={form.gender} onChange={set('gender')}>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
            <div className="modal-field">
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="07X XXXXXXX" />
            </div>
            <div className="modal-field">
              <label>Blood group</label>
              <select value={form.blood_group} onChange={set('blood_group')}>
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div className="modal-field span-2">
              <label>Allergies</label>
              <input value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin" />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPatientModal;
