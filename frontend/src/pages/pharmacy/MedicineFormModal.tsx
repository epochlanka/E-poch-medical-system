import { useState } from 'react';
import type { FormEvent } from 'react';
import { createMedicine, updateMedicine } from '../../lib/medicines';
import type { MedicineStockRow } from '../../lib/medicines';
import { COMMON_MEDICINE_FORMS, COMMON_UNITS } from './pharmacyUtils';

interface MedicineFormModalProps {
  medicine?: MedicineStockRow | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

const MedicineFormModal = ({ medicine, categories, onClose, onSaved }: MedicineFormModalProps) => {
  const isEdit = !!medicine;
  const [form, setForm] = useState({
    name: medicine?.name ?? '',
    generic_name: medicine?.generic_name ?? '',
    category: medicine?.category ?? '',
    form: medicine?.form ?? '',
    strength: medicine?.strength ?? '',
    unit: medicine?.unit ?? '',
    reorder_level: String(medicine?.reorder_level ?? 10),
    max_stock_level: String(medicine?.max_stock_level ?? ''),
    buy_price: String(medicine?.buy_price ?? ''),
    unit_price: String(medicine?.sell_price ?? ''),
    barcode: medicine?.barcode ?? '',
    is_active: medicine?.is_active ?? true,
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
        generic_name: form.generic_name || undefined,
        category: form.category || undefined,
        form: form.form || undefined,
        strength: form.strength || undefined,
        unit: form.unit,
        reorder_level: form.reorder_level ? Number(form.reorder_level) : undefined,
        max_stock_level: form.max_stock_level ? Number(form.max_stock_level) : undefined,
        buy_price: form.buy_price ? Number(form.buy_price) : undefined,
        unit_price: form.unit_price ? Number(form.unit_price) : undefined,
        barcode: form.barcode || undefined,
      };
      if (isEdit && medicine) {
        await updateMedicine(medicine.medicine_id, { ...payload, is_active: form.is_active });
      } else {
        await createMedicine(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to save medicine.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isEdit ? 'Edit Medicine' : 'Add Medicine'}</h3>
        <p className="modal-subtitle">{isEdit ? `Update the catalog entry for ${medicine!.name}.` : 'Add a new medicine to the pharmacy catalog.'}</p>

        <form onSubmit={handleSubmit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Medicine name *</label>
              <input required value={form.name} onChange={set('name')} placeholder="e.g. Amoxicillin 500mg" />
            </div>
            <div className="modal-field">
              <label>Generic name</label>
              <input value={form.generic_name} onChange={set('generic_name')} placeholder="e.g. Amoxicillin" />
            </div>
            <div className="modal-field">
              <label>Category</label>
              <input list="ph-category-options" value={form.category} onChange={set('category')} placeholder="e.g. Antibiotic" />
              <datalist id="ph-category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Form</label>
              <input list="ph-form-options" value={form.form} onChange={set('form')} placeholder="e.g. Tablet" />
              <datalist id="ph-form-options">
                {COMMON_MEDICINE_FORMS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Strength</label>
              <input value={form.strength} onChange={set('strength')} placeholder="e.g. 500mg" />
            </div>
            <div className="modal-field">
              <label>Unit *</label>
              <input list="ph-unit-options" required value={form.unit} onChange={set('unit')} placeholder="e.g. Tablet" />
              <datalist id="ph-unit-options">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Min stock (reorder level)</label>
              <input type="number" min={0} value={form.reorder_level} onChange={set('reorder_level')} />
            </div>
            <div className="modal-field">
              <label>Max stock</label>
              <input type="number" min={0} value={form.max_stock_level} onChange={set('max_stock_level')} placeholder="Optional" />
            </div>
            <div className="modal-field">
              <label>Buy price (LKR)</label>
              <input type="number" min={0} step="0.01" value={form.buy_price} onChange={set('buy_price')} />
            </div>
            <div className="modal-field">
              <label>Sell price (LKR)</label>
              <input type="number" min={0} step="0.01" value={form.unit_price} onChange={set('unit_price')} />
            </div>
            <div className="modal-field">
              <label>Barcode</label>
              <input value={form.barcode} onChange={set('barcode')} placeholder="Optional" />
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
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Medicine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MedicineFormModal;
