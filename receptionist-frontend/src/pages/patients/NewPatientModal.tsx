import { useState } from 'react';
import type { FormEvent } from 'react';
import { registerPatient } from '../../lib/patients';
import { BLOOD_GROUPS } from './patientUtils';
import FamilySearchSelect from './FamilySearchSelect';

interface NewPatientModalProps {
  onClose: () => void;
  onSuccess?: (patientId: string) => void;
}

const emptyForm = {
  full_name: '',
  dob: '',
  gender: 'Female',
  nic: '',
  guardian_nic: '',
  phone: '',
  blood_group: '',
  family_id: '',
  family_name: '',
  existing_family_name: '',
};

const NewPatientModal = ({ onClose, onSuccess }: NewPatientModalProps) => {
  const [form, setForm] = useState(emptyForm);
  const [isMinor, setIsMinor] = useState(false);
  const [familyMode, setFamilyMode] = useState<'existing' | 'new'>('new');
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
        nic: !isMinor && form.nic ? form.nic : undefined,
        guardian_nic: isMinor && form.guardian_nic ? form.guardian_nic : undefined,
        phone: form.phone || undefined,
        blood_group: form.blood_group || undefined,
        family_id: familyMode === 'existing' && form.family_id ? Number(form.family_id) : undefined,
        new_family: familyMode === 'new' ? { family_name: form.family_name } : undefined,
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
            <p className="modal-subtitle">
              {form.full_name} was saved as {createdId}.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button
                className="modal-btn primary"
                onClick={() => {
                  onClose();
                  if (onSuccess && createdId) onSuccess(createdId);
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="modal-title">Register New Patient</h3>
            <p className="modal-subtitle">Capture demographics and link them to a family.</p>

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

                <div className="modal-field span-2">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <input type="checkbox" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} style={{ width: 'auto' }} />
                    Minor — no NIC of their own (use guardian's NIC instead)
                  </label>
                </div>

                {isMinor ? (
                  <div className="modal-field span-2">
                    <label>Guardian NIC *</label>
                    <input required value={form.guardian_nic} onChange={set('guardian_nic')} placeholder="Guardian's National ID" />
                  </div>
                ) : (
                  <div className="modal-field span-2">
                    <label>NIC</label>
                    <input value={form.nic} onChange={set('nic')} placeholder="National ID" />
                  </div>
                )}

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
                  <label style={{ display: 'flex', gap: 16 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <input type="radio" checked={familyMode === 'new'} onChange={() => setFamilyMode('new')} style={{ width: 'auto' }} />
                      New family
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <input type="radio" checked={familyMode === 'existing'} onChange={() => setFamilyMode('existing')} style={{ width: 'auto' }} />
                      Existing family
                    </span>
                  </label>
                </div>

                {familyMode === 'new' ? (
                  <div className="modal-field span-2">
                    <label>Household name *</label>
                    <input required value={form.family_name} onChange={set('family_name')} placeholder="e.g. Perera Family" />
                  </div>
                ) : (
                  <div className="modal-field span-2">
                    <label>Family *</label>
                    <FamilySearchSelect
                      selectedId={form.family_id}
                      selectedName={form.existing_family_name}
                      onSelect={(id, name) => setForm((f) => ({ ...f, family_id: id, existing_family_name: name }))}
                      onClear={() => setForm((f) => ({ ...f, family_id: '', existing_family_name: '' }))}
                    />
                  </div>
                )}
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
