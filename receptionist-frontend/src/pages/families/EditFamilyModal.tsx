import { useState } from 'react';
import type { FormEvent } from 'react';
import { updateFamily } from '../../lib/families';
import type { Family } from '../../lib/families';
import { formatFamilyCode, FAMILY_TYPES } from './familyUtils';

interface EditFamilyModalProps {
  family: Family;
  onClose: () => void;
  onSaved: () => void;
}

const EditFamilyModal = ({ family, onClose, onSaved }: EditFamilyModalProps) => {
  const [form, setForm] = useState({
    family_name: family.family_name,
    address: family.address ?? '',
    city: family.city ?? '',
    family_type: family.family_type ?? '',
    contact_no: family.contact_no ?? '',
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
      await updateFamily(family.family_id, {
        family_name: form.family_name,
        address: form.address || undefined,
        city: form.city || undefined,
        family_type: form.family_type || undefined,
        contact_no: form.contact_no || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to update family.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Family</h3>
        <p className="modal-subtitle">{formatFamilyCode(family.family_id)}</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Family name *</label>
              <input required value={form.family_name} onChange={set('family_name')} />
            </div>
            <div className="modal-field">
              <label>Relationship type</label>
              <select value={form.family_type} onChange={set('family_type')}>
                <option value="">Select type</option>
                {FAMILY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>City</label>
              <input value={form.city} onChange={set('city')} />
            </div>
            <div className="modal-field span-2">
              <label>Address</label>
              <input value={form.address} onChange={set('address')} />
            </div>
            <div className="modal-field span-2">
              <label>Primary Phone</label>
              <input value={form.contact_no} onChange={set('contact_no')} />
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

export default EditFamilyModal;
