import { useState } from 'react';
import type { FormEvent } from 'react';
import { createFamily } from '../../lib/families';
import { FAMILY_TYPES } from './familyUtils';

interface NewFamilyModalProps {
  onClose: () => void;
  onSuccess: (familyId: number) => void;
}

const NewFamilyModal = ({ onClose, onSuccess }: NewFamilyModalProps) => {
  const [form, setForm] = useState({ family_name: '', address: '', city: '', family_type: '', contact_no: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const family = await createFamily({
        family_name: form.family_name,
        address: form.address || undefined,
        city: form.city || undefined,
        family_type: form.family_type || undefined,
        contact_no: form.contact_no || undefined,
      });
      onSuccess(family.family_id);
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to create family.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Add New Family</h3>
        <p className="modal-subtitle">Creates a household record you can attach patients to.</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Family name *</label>
              <input required value={form.family_name} onChange={set('family_name')} placeholder="e.g. Perera Family" />
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
              <input value={form.city} onChange={set('city')} placeholder="e.g. Matale" />
            </div>
            <div className="modal-field span-2">
              <label>Address</label>
              <input value={form.address} onChange={set('address')} placeholder="e.g. 123 Main Street, Kandy" />
            </div>
            <div className="modal-field span-2">
              <label>Primary Phone</label>
              <input value={form.contact_no} onChange={set('contact_no')} placeholder="07X XXXXXXX" />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Family'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewFamilyModal;
