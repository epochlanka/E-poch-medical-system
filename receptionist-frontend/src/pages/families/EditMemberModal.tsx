import { useState } from 'react';
import type { FormEvent } from 'react';
import { updatePatient } from '../../lib/patients';
import type { FamilyMember } from '../../lib/families';
import { RELATIONSHIPS_TO_HEAD } from '../patients/registerPatientUtils';

interface EditMemberModalProps {
  member: FamilyMember;
  familyName: string;
  onClose: () => void;
  onSaved: () => void;
}

const EditMemberModal = ({ member, familyName, onClose, onSaved }: EditMemberModalProps) => {
  const [form, setForm] = useState({
    full_name: member.full_name,
    gender: member.gender,
    phone: member.phone ?? '',
    relationship_to_head: member.relationship_to_head ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updatePatient(member.patient_id, {
        full_name: form.full_name,
        gender: form.gender,
        phone: form.phone || undefined,
        relationship_to_head: member.is_head ? undefined : form.relationship_to_head || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to update member.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Family Member</h3>
        <p className="modal-subtitle">
          {member.patient_id} · {familyName}
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
            <div className="modal-field span-2">
              <label>Relationship to Head</label>
              {member.is_head ? (
                <input value="Self (Head of Family)" disabled />
              ) : (
                <select value={form.relationship_to_head} onChange={set('relationship_to_head')}>
                  <option value="">Select relationship</option>
                  {RELATIONSHIPS_TO_HEAD.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              )}
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

export default EditMemberModal;
