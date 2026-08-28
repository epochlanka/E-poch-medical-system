import { useState } from 'react';
import type { FormEvent } from 'react';
import { registerPatient } from '../../lib/patients';
import { BLOOD_GROUPS } from '../patients/patientUtils';
import { RELATIONSHIPS_TO_HEAD } from '../patients/registerPatientUtils';

interface AddFamilyMemberModalProps {
  familyId: number;
  familyName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const emptyForm = { full_name: '', dob: '', gender: 'Female', nic: '', phone: '', blood_group: '', relationship_to_head: '' };

const AddFamilyMemberModal = ({ familyId, familyName, onClose, onSuccess }: AddFamilyMemberModalProps) => {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerPatient({
        full_name: form.full_name,
        dob: form.dob,
        gender: form.gender,
        nic: form.nic || undefined,
        phone: form.phone || undefined,
        blood_group: form.blood_group || undefined,
        relationship_to_head: form.relationship_to_head || undefined,
        family_id: familyId,
      });
      onSuccess();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(`${err.response.data.message} (existing patient: ${err.response.data.conflictingPatient?.patient_id})`);
      } else if (err.response?.data?.details?.length) {
        setError(err.response.data.details.map((d: any) => d.message).join(', '));
      } else {
        setError(err.response?.data?.message || 'Failed to add family member.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Add Family Member</h3>
        <p className="modal-subtitle">Registers a new patient under {familyName}.</p>

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
              <label>Relationship to Head</label>
              <select value={form.relationship_to_head} onChange={set('relationship_to_head')}>
                <option value="">Select relationship</option>
                {RELATIONSHIPS_TO_HEAD.map((r) => (
                  <option key={r}>{r}</option>
                ))}
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
            <div className="modal-field span-2">
              <label>Blood group</label>
              <select value={form.blood_group} onChange={set('blood_group')}>
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg}>{bg}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFamilyMemberModal;
