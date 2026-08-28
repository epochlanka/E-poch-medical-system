import { useState } from 'react';
import type { FormEvent } from 'react';
import { createMedicine, updateMedicine } from '../../lib/medicines';
import type { MedicineCatalogRow, CatalogMeta } from '../../lib/medicines';
import { XIcon, SaveIcon } from '../../components/layout/Icons';

type Mode = 'add' | 'edit' | 'view';

interface Props {
  mode: Mode;
  medicine?: MedicineCatalogRow;
  meta?: CatalogMeta;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  generic_name: string;
  brand_name: string;
  category: string;
  form: string;
  strength: string;
  manufacturer: string;
  unit: string;
  reorder_level: string;
  max_stock_level: string;
  unit_price: string;
  buy_price: string;
  barcode: string;
}

const emptyForm: FormState = {
  name: '',
  generic_name: '',
  brand_name: '',
  category: '',
  form: '',
  strength: '',
  manufacturer: '',
  unit: '',
  reorder_level: '0',
  max_stock_level: '0',
  unit_price: '0',
  buy_price: '0',
  barcode: '',
};

const toForm = (m?: MedicineCatalogRow): FormState =>
  m
    ? {
        name: m.name,
        generic_name: m.generic_name ?? '',
        brand_name: m.brand_name ?? '',
        category: m.category ?? '',
        form: m.form ?? '',
        strength: m.strength ?? '',
        manufacturer: m.manufacturer ?? '',
        unit: m.unit,
        reorder_level: String(m.reorder_level),
        max_stock_level: String(m.max_stock_level),
        unit_price: String(m.unit_price),
        buy_price: String(m.buy_price),
        barcode: m.barcode ?? '',
      }
    : emptyForm;

const MedicineFormModal = ({ mode, medicine, meta, onClose, onSaved }: Props) => {
  const [form, setForm] = useState<FormState>(toForm(medicine));
  const [isActive, setIsActive] = useState(medicine?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = mode === 'view';

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    if (!form.name.trim()) return setError('Medicine name is required.');
    if (!form.unit.trim()) return setError('Unit is required.');

    const input = {
      name: form.name.trim(),
      generic_name: form.generic_name.trim() || undefined,
      brand_name: form.brand_name.trim() || undefined,
      category: form.category.trim() || undefined,
      form: form.form.trim() || undefined,
      strength: form.strength.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      unit: form.unit.trim(),
      reorder_level: Number(form.reorder_level) || 0,
      max_stock_level: Number(form.max_stock_level) || 0,
      unit_price: Number(form.unit_price) || 0,
      buy_price: Number(form.buy_price) || 0,
      barcode: form.barcode.trim() || undefined,
    };

    setSaving(true);
    try {
      if (mode === 'edit' && medicine) {
        await updateMedicine(medicine.medicine_id, { ...input, is_active: isActive });
      } else {
        await createMedicine(input);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save medicine.');
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'add' ? 'Add New Medicine' : mode === 'edit' ? 'Edit Medicine' : 'Medicine Details';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Medicine Name *</label>
              <input value={form.name} onChange={set('name')} disabled={readOnly} required />
            </div>
            <div className="modal-field">
              <label>Generic Name</label>
              <input value={form.generic_name} onChange={set('generic_name')} disabled={readOnly} />
            </div>
            <div className="modal-field">
              <label>Brand Name</label>
              <input value={form.brand_name} onChange={set('brand_name')} disabled={readOnly} />
            </div>
            <div className="modal-field">
              <label>Therapeutic Class</label>
              <input value={form.category} onChange={set('category')} disabled={readOnly} list="therapeutic-class-options" />
              <datalist id="therapeutic-class-options">
                {meta?.therapeuticClasses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Dosage Form</label>
              <input value={form.form} onChange={set('form')} disabled={readOnly} list="dosage-form-options" />
              <datalist id="dosage-form-options">
                {meta?.dosageForms.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Strength</label>
              <input value={form.strength} onChange={set('strength')} disabled={readOnly} placeholder="e.g. 500mg" />
            </div>
            <div className="modal-field">
              <label>Unit *</label>
              <input value={form.unit} onChange={set('unit')} disabled={readOnly} placeholder="e.g. Tablet" required />
            </div>
            <div className="modal-field span-2">
              <label>Manufacturer</label>
              <input value={form.manufacturer} onChange={set('manufacturer')} disabled={readOnly} list="manufacturer-options" />
              <datalist id="manufacturer-options">
                {meta?.manufacturers.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Min Stock (Reorder Level)</label>
              <input type="number" min={0} value={form.reorder_level} onChange={set('reorder_level')} disabled={readOnly} />
            </div>
            <div className="modal-field">
              <label>Max Stock Level</label>
              <input type="number" min={0} value={form.max_stock_level} onChange={set('max_stock_level')} disabled={readOnly} />
            </div>
            <div className="modal-field">
              <label>Sell Price</label>
              <input type="number" min={0} step="0.01" value={form.unit_price} onChange={set('unit_price')} disabled={readOnly} />
            </div>
            <div className="modal-field">
              <label>Buy Price</label>
              <input type="number" min={0} step="0.01" value={form.buy_price} onChange={set('buy_price')} disabled={readOnly} />
            </div>
            <div className="modal-field span-2">
              <label>Barcode / Medicine Code</label>
              <input value={form.barcode} onChange={set('barcode')} disabled={readOnly} placeholder="Auto-generated if left blank" />
            </div>
            {mode === 'edit' && (
              <div className="modal-field span-2">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 'auto' }} />
                  Active
                </label>
              </div>
            )}
            {mode === 'view' && (
              <div className="modal-field span-2">
                <label>Status</label>
                <span className={`badge ${medicine?.is_active ? 'badge-green' : 'badge-red'}`} style={{ width: 'fit-content' }}>
                  {medicine?.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            )}
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button type="submit" className="modal-btn primary" disabled={saving}>
                <SaveIcon /> {saving ? 'Saving…' : mode === 'add' ? 'Add Medicine' : 'Save Changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default MedicineFormModal;
