import { useState } from 'react';
import type { FormEvent } from 'react';
import { createSupplier, updateSupplier } from '../../lib/suppliers';
import type { Supplier } from '../../lib/suppliers';

interface SupplierFormModalProps {
  supplier?: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}

const SupplierFormModal = ({ supplier, onClose, onSaved }: SupplierFormModalProps) => {
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_person: supplier?.contact_person ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    city: supplier?.city ?? '',
    payment_terms_days: String(supplier?.payment_terms_days ?? 30),
    address: supplier?.address ?? '',
    is_active: supplier?.is_active ?? true,
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
      const payload = {
        name: form.name,
        contact_person: form.contact_person || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        city: form.city || undefined,
        payment_terms_days: form.payment_terms_days ? Number(form.payment_terms_days) : undefined,
        address: form.address || undefined,
      };
      if (isEdit && supplier) {
        await updateSupplier(supplier.supplier_id, { ...payload, is_active: form.is_active });
      } else {
        await createSupplier(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to save supplier.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h3>
        <p className="modal-subtitle">{isEdit ? `Update details for ${supplier!.name}.` : 'Add a new supplier to the directory.'}</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Supplier name *</label>
              <input required value={form.name} onChange={set('name')} placeholder="e.g. Medico Supplies (Pvt) Ltd" />
            </div>
            <div className="modal-field">
              <label>Contact person</label>
              <input value={form.contact_person} onChange={set('contact_person')} placeholder="e.g. Mr. Nimal Perera" />
            </div>
            <div className="modal-field">
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="077 123 4567" />
            </div>
            <div className="modal-field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="info@supplier.lk" />
            </div>
            <div className="modal-field">
              <label>City</label>
              <input value={form.city} onChange={set('city')} placeholder="e.g. Colombo" />
            </div>
            <div className="modal-field">
              <label>Payment terms (days)</label>
              <input type="number" min={0} value={form.payment_terms_days} onChange={set('payment_terms_days')} />
            </div>
            {isEdit && (
              <div className="modal-field">
                <label>Status</label>
                <select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
            <div className="modal-field span-2">
              <label>Address</label>
              <input value={form.address} onChange={set('address')} placeholder="Street, city" />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierFormModal;
