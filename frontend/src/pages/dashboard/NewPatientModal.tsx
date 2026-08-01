import { useState } from 'react';
import type { FormEvent } from 'react';
import { registerPatient } from '../../lib/patients';

interface NewPatientModalProps {
  onClose: () => void;
}

const emptyForm = {
  full_name: '',
  dob: '',
  gender: 'Female',
  nic: '',
  phone: '',
  blood_group: '',
  family_name: '',
};

const NewPatientModal = ({ onClose }: NewPatientModalProps) => {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await registerPatient({
        full_name: form.full_name,
        dob: form.dob,
        gender: form.gender,
        nic: form.nic || undefined,
        phone: form.phone || undefined,
        blood_group: form.blood_group || undefined,
        new_family: { family_name: form.family_name },
      });
      setCreatedId(result.patient.patient_id);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(`${err.response.data.message} (existing patient: ${err.response.data.conflictingPatient?.patient_id})`);
      } else if (err.response?.data?.details?.length) {
        setError(err.response.data.details.map((d: any) => d.message).join(', '));
      } else {
        setError(err.response?.data?.message || 'Failed to register patient.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {createdId ? (
          <div className="modal-success">
            <div className="modal-success-icon">✓</div>
            <h3 className="modal-title" style={{ marginBottom: 6 }}>
              Patient registered
            </h3>
            <p className="modal-subtitle">{form.full_name} was saved as {createdId}.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="modal-btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="modal-title">Register New Patient</h3>
            <p className="modal-subtitle">Creates the patient and a new household record.</p>

            <form onSubmit={handleSubmit}>
              <div className="modal-grid">
                <div className="modal-field span-2">
                  <label>Full name *</label>
                  <input required value={form.full_name} onChange={set('full_name')} placeholder="e.g. Nimal Perera" />
                </div>
                <div className="modal-field">
                  <label>Date of birth *</label>
                  <input required type="date" value={form.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} />
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
                  <label>NIC</label>
                  <input value={form.nic} onChange={set('nic')} placeholder="National ID" />
                </div>
                <div className="modal-field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={set('phone')} placeholder="07X XXXXXXX" />
                </div>
                <div className="modal-field">
                  <label>Blood group</label>
                  <select value={form.blood_group} onChange={set('blood_group')}>
                    <option value="">Unknown</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                      <option key={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label>Household name *</label>
                  <input required value={form.family_name} onChange={set('family_name')} placeholder="e.g. Perera Family" />
                </div>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <div className="modal-actions">
                <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Register Patient'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default NewPatientModal;
