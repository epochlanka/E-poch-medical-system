import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createMedicine,
  updateMedicine,
  BASE_UNITS,
  PACK_UNITS,
  DOSAGE_FORMS,
  defaultBaseUnitForForm,
} from '../../lib/medicines';
import type { CatalogMeta, MedicineCatalogRow, StockBatchInput } from '../../lib/medicines';
import { useApiData } from '../../hooks/useApiData';
import { listSuppliers } from '../../lib/suppliers';
import { XIcon, SaveIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/layout/Icons';

interface MedicineFormModalProps {
  medicine?: MedicineCatalogRow | null;
  meta?: CatalogMeta | null;
  onClose: () => void;
  onSaved: () => void;
}

// ---- Edit: a quick single-page form for master-data fields only — packaging/pricing for
// existing stock lives on its batches (Add Stock Batch), never rewritten here. ------------------

interface EditFormState {
  name: string;
  generic_name: string;
  brand_name: string;
  category: string;
  form: string;
  strength: string;
  manufacturer: string;
  requires_prescription: boolean;
  base_unit: string;
  default_pack_unit: string;
  default_pack_size: string;
  default_selling_price: string;
  reorder_level: string;
  max_stock_level: string;
  barcode: string;
}

const toEditForm = (m: MedicineCatalogRow): EditFormState => ({
  name: m.name,
  generic_name: m.generic_name ?? '',
  brand_name: m.brand_name ?? '',
  category: m.category ?? '',
  form: m.form ?? '',
  strength: m.strength ?? '',
  manufacturer: m.manufacturer ?? '',
  requires_prescription: m.requires_prescription,
  base_unit: m.base_unit,
  default_pack_unit: m.default_pack_unit ?? '',
  default_pack_size: m.default_pack_size ? String(m.default_pack_size) : '',
  default_selling_price: String(m.default_selling_price),
  reorder_level: String(m.reorder_level),
  max_stock_level: String(m.max_stock_level),
  barcode: m.barcode ?? '',
});

const EditForm = ({ medicine, meta, onClose, onSaved }: MedicineFormModalProps & { medicine: MedicineCatalogRow }) => {
  const [form, setForm] = useState<EditFormState>(toEditForm(medicine));
  const [isActive, setIsActive] = useState(medicine.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof EditFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Medicine name is required.');
    if (!form.base_unit.trim()) return setError('Base unit is required.');

    setSaving(true);
    try {
      await updateMedicine(medicine.medicine_id, {
        name: form.name.trim(),
        generic_name: form.generic_name.trim() || undefined,
        brand_name: form.brand_name.trim() || undefined,
        category: form.category.trim() || undefined,
        form: form.form.trim() || undefined,
        strength: form.strength.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        requires_prescription: form.requires_prescription,
        base_unit: form.base_unit.trim(),
        default_pack_unit: form.default_pack_unit.trim() || undefined,
        default_pack_size: form.default_pack_size ? Number(form.default_pack_size) : undefined,
        default_selling_price: Number(form.default_selling_price) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        max_stock_level: Number(form.max_stock_level) || 0,
        barcode: form.barcode.trim() || undefined,
        is_active: isActive,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to save medicine.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">Edit Medicine</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <p className="modal-subtitle">
          Update the catalog entry for {medicine.name}. Product details only — stock and pricing live on this medicine's batches.
        </p>

        <form onSubmit={submit}>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Medicine Name *</label>
              <input value={form.name} onChange={set('name')} required />
            </div>
            <div className="modal-field">
              <label>Brand Name</label>
              <input value={form.brand_name} onChange={set('brand_name')} />
            </div>
            <div className="modal-field">
              <label>Generic Name</label>
              <input value={form.generic_name} onChange={set('generic_name')} />
            </div>
            <div className="modal-field">
              <label>Therapeutic Class / Category</label>
              <input value={form.category} onChange={set('category')} list="med-therapeutic-class-options" />
              <datalist id="med-therapeutic-class-options">
                {meta?.therapeuticClasses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Dosage Form</label>
              <input value={form.form} onChange={set('form')} list="med-dosage-form-options" />
              <datalist id="med-dosage-form-options">
                {(meta?.dosageForms.length ? meta.dosageForms : DOSAGE_FORMS).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Strength</label>
              <input value={form.strength} onChange={set('strength')} placeholder="e.g. 500mg" />
            </div>
            <div className="modal-field">
              <label>Base Unit *</label>
              <select value={form.base_unit} onChange={set('base_unit')} required>
                {BASE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-field span-2">
              <label>Manufacturer</label>
              <input value={form.manufacturer} onChange={set('manufacturer')} list="med-manufacturer-options" />
              <datalist id="med-manufacturer-options">
                {meta?.manufacturers.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="modal-field">
              <label>Default Pack Unit</label>
              <select value={form.default_pack_unit} onChange={set('default_pack_unit')}>
                <option value="">None</option>
                {PACK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>{form.base_unit || 'Units'} per default pack</label>
              <input type="number" min={0} value={form.default_pack_size} onChange={set('default_pack_size')} />
            </div>
            <div className="modal-field">
              <label>Min Stock (Reorder Level)</label>
              <input type="number" min={0} value={form.reorder_level} onChange={set('reorder_level')} />
            </div>
            <div className="modal-field">
              <label>Max Stock Level</label>
              <input type="number" min={0} value={form.max_stock_level} onChange={set('max_stock_level')} />
            </div>
            <div className="modal-field">
              <label>Reference Sell Price</label>
              <input type="number" min={0} step="0.01" value={form.default_selling_price} onChange={set('default_selling_price')} />
            </div>
            <div className="modal-field">
              <label>Barcode / Medicine Code</label>
              <input value={form.barcode} onChange={set('barcode')} placeholder="Auto-generated if left blank" />
            </div>
            <div className="modal-field span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.requires_prescription}
                  onChange={(e) => setForm((f) => ({ ...f, requires_prescription: e.target.checked }))}
                  style={{ width: 'auto' }}
                />
                Prescription required
              </label>
            </div>
            <div className="modal-field span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 'auto' }} />
                Active
              </label>
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={saving}>
              <SaveIcon /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---- Add: 5-step wizard (Medicine Details -> Packaging & Unit -> Initial Stock -> Pricing ->
// Review & Save), mirroring pharmacist-frontend's Add Medicine flow against the same contract. ---

const STEPS = ['Medicine Details', 'Packaging & Unit', 'Initial Stock', 'Pricing', 'Review & Save'] as const;

interface AddFormState {
  name: string;
  brand_name: string;
  generic_name: string;
  category: string;
  form: string;
  strength: string;
  manufacturer: string;
  requires_prescription: boolean;
  base_unit: string;
  default_pack_unit: string;
  default_pack_size: string;
  default_selling_price: string;
  reorder_level: string;
  max_stock_level: string;
  barcode: string;
  addOpeningStock: boolean;
  supplier_id: string;
  batch_no: string;
  purchase_date: string;
  manufacture_date: string;
  expiry_date: string;
  received_unit: string;
  received_qty: string;
  units_per_pack: string;
  purchase_price_per_pack: string;
  selling_price_per_pack: string;
  location: string;
}

const emptyAddForm: AddFormState = {
  name: '',
  brand_name: '',
  generic_name: '',
  category: '',
  form: '',
  strength: '',
  manufacturer: '',
  requires_prescription: false,
  base_unit: 'Tablet',
  default_pack_unit: 'Box',
  default_pack_size: '',
  default_selling_price: '0',
  reorder_level: '0',
  max_stock_level: '0',
  barcode: '',
  addOpeningStock: false,
  supplier_id: '',
  batch_no: '',
  purchase_date: '',
  manufacture_date: '',
  expiry_date: '',
  received_unit: 'Box',
  received_qty: '',
  units_per_pack: '',
  purchase_price_per_pack: '',
  selling_price_per_pack: '',
  location: '',
};

const AddWizard = ({ meta, onClose, onSaved }: MedicineFormModalProps) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AddFormState>(emptyAddForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: suppliers } = useApiData(() => listSuppliers(), []);

  const set = <K extends keyof AddFormState>(field: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value as AddFormState[K] }));
  };

  const onFormChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dosageForm = e.target.value;
    setForm((f) => ({
      ...f,
      form: dosageForm,
      base_unit: f.base_unit === defaultBaseUnitForForm(f.form) || !f.form ? defaultBaseUnitForForm(dosageForm) : f.base_unit,
    }));
  };

  const unitsPerPack = Number(form.units_per_pack) || 0;
  const purchasePricePerPack = Number(form.purchase_price_per_pack) || 0;
  const sellingPricePerPack = Number(form.selling_price_per_pack) || 0;
  const costPerBaseUnit = unitsPerPack > 0 ? purchasePricePerPack / unitsPerPack : 0;
  const sellPerBaseUnit = unitsPerPack > 0 ? sellingPricePerPack / unitsPerPack : 0;
  const profitPerBaseUnit = sellPerBaseUnit - costPerBaseUnit;
  const marginPct = sellPerBaseUnit > 0 ? (profitPerBaseUnit / sellPerBaseUnit) * 100 : 0;

  const stepErrors = useMemo(() => {
    const errs: string[] = [];
    if (step === 0) {
      if (!form.name.trim()) errs.push('Medicine name is required.');
    }
    if (step === 1) {
      if (!form.base_unit.trim()) errs.push('Base unit is required.');
    }
    if (step === 2 && form.addOpeningStock) {
      if (!form.supplier_id) errs.push('Choose a supplier.');
      if (!form.batch_no.trim()) errs.push('Batch number is required.');
      if (!form.expiry_date) errs.push('Expiry date is required.');
      else if (new Date(form.expiry_date) <= new Date()) errs.push('Expiry date must be in the future.');
      if (!form.received_qty || Number(form.received_qty) <= 0) errs.push('Received quantity must be greater than zero.');
      if (!form.units_per_pack || Number(form.units_per_pack) <= 0) errs.push(`${form.base_unit || 'Units'} per pack must be greater than zero.`);
    }
    if (step === 3 && form.addOpeningStock) {
      if (!form.purchase_price_per_pack || Number(form.purchase_price_per_pack) < 0) errs.push('Purchase price per pack is required.');
      if (!form.selling_price_per_pack || Number(form.selling_price_per_pack) <= 0) errs.push('Selling price per pack is required.');
    }
    return errs;
  }, [step, form]);

  const goNext = () => {
    if (stepErrors.length) {
      setError(stepErrors[0]);
      return;
    }
    setError(null);
    // Skip the Initial Stock / Pricing steps entirely if not adding opening stock.
    if (step === 1 && !form.addOpeningStock) {
      setStep(4);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setError(null);
    if (step === 4 && !form.addOpeningStock) {
      setStep(1);
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const initial_stock: StockBatchInput | undefined = form.addOpeningStock
        ? {
            supplier_id: Number(form.supplier_id),
            batch_no: form.batch_no.trim(),
            purchase_date: form.purchase_date || undefined,
            manufacture_date: form.manufacture_date || undefined,
            expiry_date: form.expiry_date,
            received_unit: form.received_unit,
            received_qty: Number(form.received_qty),
            units_per_pack: Number(form.units_per_pack),
            purchase_price_per_pack: Number(form.purchase_price_per_pack),
            selling_price_per_pack: Number(form.selling_price_per_pack),
            location: form.location.trim() || undefined,
          }
        : undefined;

      await createMedicine({
        name: form.name.trim(),
        brand_name: form.brand_name.trim() || undefined,
        generic_name: form.generic_name.trim() || undefined,
        category: form.category.trim() || undefined,
        form: form.form.trim() || undefined,
        strength: form.strength.trim() || undefined,
        manufacturer: form.manufacturer.trim() || undefined,
        requires_prescription: form.requires_prescription,
        base_unit: form.base_unit.trim(),
        default_pack_unit: form.default_pack_unit.trim() || undefined,
        default_pack_size: form.default_pack_size ? Number(form.default_pack_size) : undefined,
        default_selling_price: Number(form.default_selling_price) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        max_stock_level: Number(form.max_stock_level) || 0,
        barcode: form.barcode.trim() || undefined,
        initial_stock,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to save medicine.');
    } finally {
      setSaving(false);
    }
  };

  const supplierName = suppliers?.find((s) => String(s.supplier_id) === form.supplier_id)?.name;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">Add New Medicine</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="wiz-steps">
          {STEPS.map((label, i) => (
            <span key={label} style={{ display: 'contents' }}>
              <span className={`wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                <span className="wiz-step-dot">{i < step ? '✓' : i + 1}</span>
                <span className="wiz-step-label">{label}</span>
              </span>
              {i < STEPS.length - 1 && <span className={`wiz-step-line ${i < step ? 'done' : ''}`} />}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div>
            <p className="wiz-section-title">Medicine Details</p>
            <p className="wiz-section-help">
              Medicine name and brand name are kept separate — the same generic medicine with a different brand, strength or form is a
              new entry.
            </p>
            <div className="modal-grid">
              <div className="modal-field span-2">
                <label>Medicine Name *</label>
                <input value={form.name} onChange={set('name')} placeholder="e.g. Paracetamol 500mg" required />
              </div>
              <div className="modal-field">
                <label>Brand Name</label>
                <input value={form.brand_name} onChange={set('brand_name')} placeholder="e.g. Panadol" />
              </div>
              <div className="modal-field">
                <label>Generic Name</label>
                <input value={form.generic_name} onChange={set('generic_name')} placeholder="e.g. Paracetamol" />
              </div>
              <div className="modal-field">
                <label>Category</label>
                <input value={form.category} onChange={set('category')} list="wiz-category-options" />
                <datalist id="wiz-category-options">
                  {meta?.therapeuticClasses.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="modal-field">
                <label>Dosage Form</label>
                <select value={form.form} onChange={onFormChange}>
                  <option value="">Choose form</option>
                  {DOSAGE_FORMS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Strength</label>
                <input value={form.strength} onChange={set('strength')} placeholder="e.g. 500mg" />
              </div>
              <div className="modal-field">
                <label>Manufacturer</label>
                <input value={form.manufacturer} onChange={set('manufacturer')} list="wiz-manufacturer-options" />
                <datalist id="wiz-manufacturer-options">
                  {meta?.manufacturers.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="modal-field span-2">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.requires_prescription} onChange={set('requires_prescription')} style={{ width: 'auto' }} />
                  Prescription required
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="wiz-section-title">Packaging & Unit Configuration</p>
            <p className="wiz-section-help">
              The base unit is what stock and pricing are tracked in. Packaging is a default only — each batch can still be received
              differently.
            </p>
            <div className="modal-grid">
              <div className="modal-field">
                <label>Base Unit *</label>
                <select value={form.base_unit} onChange={set('base_unit')} required>
                  {BASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>Default Pack Unit</label>
                <select value={form.default_pack_unit} onChange={set('default_pack_unit')}>
                  <option value="">None (sold loose only)</option>
                  {PACK_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field span-2">
                <label>
                  {form.base_unit || 'Units'} per {form.default_pack_unit || 'pack'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.default_pack_size}
                  onChange={set('default_pack_size')}
                  placeholder={form.form === 'Syrup' || form.base_unit === 'ml' ? 'e.g. 100 (ml per bottle)' : 'e.g. 100 (tablets per box)'}
                />
              </div>
              <div className="modal-field">
                <label>Min Stock (Reorder Level)</label>
                <input type="number" min={0} value={form.reorder_level} onChange={set('reorder_level')} />
              </div>
              <div className="modal-field">
                <label>Max Stock Level</label>
                <input type="number" min={0} value={form.max_stock_level} onChange={set('max_stock_level')} />
              </div>
              <div className="modal-field span-2">
                <label>Barcode / Medicine Code</label>
                <input value={form.barcode} onChange={set('barcode')} placeholder="Auto-generated if left blank" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="wiz-section-title">Initial Stock & Batch Details</p>
            <p className="wiz-section-help">Optional — skip this if you'll add stock later via "Add Stock Batch".</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="checkbox" checked={form.addOpeningStock} onChange={set('addOpeningStock')} style={{ width: 'auto' }} />
              Add opening stock now
            </label>
            {form.addOpeningStock && (
              <div className="modal-grid">
                <div className="modal-field">
                  <label>Supplier *</label>
                  <select value={form.supplier_id} onChange={set('supplier_id')} required>
                    <option value="">Choose supplier</option>
                    {suppliers
                      ?.filter((s) => s.is_active)
                      .map((s) => (
                        <option key={s.supplier_id} value={s.supplier_id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label>Batch Number *</label>
                  <input value={form.batch_no} onChange={set('batch_no')} required />
                </div>
                <div className="modal-field">
                  <label>Purchase Date</label>
                  <input type="date" value={form.purchase_date} onChange={set('purchase_date')} />
                </div>
                <div className="modal-field">
                  <label>Manufacturing Date (optional)</label>
                  <input type="date" value={form.manufacture_date} onChange={set('manufacture_date')} />
                </div>
                <div className="modal-field">
                  <label>Expiry Date *</label>
                  <input type="date" value={form.expiry_date} onChange={set('expiry_date')} required />
                </div>
                <div className="modal-field">
                  <label>Received As *</label>
                  <select value={form.received_unit} onChange={set('received_unit')}>
                    {PACK_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label>Purchase Quantity ({form.received_unit}) *</label>
                  <input type="number" min={0} step="1" value={form.received_qty} onChange={set('received_qty')} required />
                </div>
                <div className="modal-field">
                  <label>
                    {form.base_unit || 'Units'} per {form.received_unit} *
                  </label>
                  <input type="number" min={0} value={form.units_per_pack} onChange={set('units_per_pack')} required />
                </div>
                <div className="modal-field span-2">
                  <label>Storage Location</label>
                  <input value={form.location} onChange={set('location')} placeholder="e.g. Main Store / Shelf A-01" />
                </div>
                {unitsPerPack > 0 && Number(form.received_qty) > 0 && (
                  <div className="modal-field span-2">
                    <div className="wiz-calc-box">
                      Quantity in base units: {(Number(form.received_qty) * unitsPerPack).toLocaleString()} {form.base_unit}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="wiz-section-title">Pricing</p>
            <p className="wiz-section-help">Purchase price is never used to work out the selling price, and vice versa — enter both.</p>
            <div className="modal-grid">
              <div className="modal-field">
                <label>Purchase Price per {form.received_unit} *</label>
                <input type="number" min={0} step="0.01" value={form.purchase_price_per_pack} onChange={set('purchase_price_per_pack')} required />
              </div>
              <div className="modal-field">
                <label>Selling Price per {form.received_unit} *</label>
                <input type="number" min={0} step="0.01" value={form.selling_price_per_pack} onChange={set('selling_price_per_pack')} required />
              </div>
              <div className="modal-field span-2">
                <label>Reference Sell Price (shown before any stock exists)</label>
                <input type="number" min={0} step="0.01" value={form.default_selling_price} onChange={set('default_selling_price')} />
              </div>
              {unitsPerPack > 0 && (purchasePricePerPack > 0 || sellingPricePerPack > 0) && (
                <div className="modal-field span-2">
                  <div className="wiz-calc-box">
                    Cost per {form.base_unit}: {costPerBaseUnit.toFixed(2)} · Selling price per {form.base_unit}: {sellPerBaseUnit.toFixed(2)} · Profit per{' '}
                    {form.base_unit}: {profitPerBaseUnit.toFixed(2)} ({marginPct.toFixed(1)}% margin)
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="wiz-section-title">Review & Save</p>
            <div className="wiz-review-row">
              <span>Medicine</span>
              <span>
                {form.name || '—'} {form.brand_name && `(${form.brand_name})`}
              </span>
            </div>
            <div className="wiz-review-row">
              <span>Generic / Category</span>
              <span>
                {form.generic_name || '—'} · {form.category || '—'}
              </span>
            </div>
            <div className="wiz-review-row">
              <span>Form / Strength</span>
              <span>
                {form.form || '—'} · {form.strength || '—'}
              </span>
            </div>
            <div className="wiz-review-row">
              <span>Base Unit</span>
              <span>{form.base_unit}</span>
            </div>
            <div className="wiz-review-row">
              <span>Default Packaging</span>
              <span>{form.default_pack_unit ? `${form.default_pack_size || '?'} ${form.base_unit} per ${form.default_pack_unit}` : 'Not set'}</span>
            </div>
            <div className="wiz-review-row">
              <span>Prescription Required</span>
              <span>{form.requires_prescription ? 'Yes' : 'No'}</span>
            </div>
            {form.addOpeningStock ? (
              <>
                <div className="wiz-review-row">
                  <span>Opening Stock</span>
                  <span>
                    {form.received_qty || 0} {form.received_unit} ({(Number(form.received_qty) || 0) * unitsPerPack} {form.base_unit}) from{' '}
                    {supplierName || '—'}
                  </span>
                </div>
                <div className="wiz-review-row">
                  <span>Batch / Expiry</span>
                  <span>
                    {form.batch_no || '—'} · Expires {form.expiry_date || '—'}
                  </span>
                </div>
                <div className="wiz-review-row">
                  <span>Pricing</span>
                  <span>
                    Cost {costPerBaseUnit.toFixed(2)} / Sell {sellPerBaseUnit.toFixed(2)} per {form.base_unit}
                  </span>
                </div>
              </>
            ) : (
              <div className="wiz-review-row">
                <span>Opening Stock</span>
                <span>None — add later via "Add Stock Batch"</span>
              </div>
            )}
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          {step > 0 ? (
            <button type="button" className="modal-btn secondary" onClick={goBack}>
              <ChevronLeftIcon /> Back
            </button>
          ) : (
            <button type="button" className="modal-btn secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="modal-btn primary" onClick={goNext}>
              Next <ChevronRightIcon />
            </button>
          ) : (
            <button type="button" className="modal-btn primary" disabled={saving} onClick={submit}>
              <SaveIcon /> {saving ? 'Saving…' : 'Add Medicine'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MedicineFormModal = (props: MedicineFormModalProps) => {
  if (!props.medicine) return <AddWizard {...props} />;
  return <EditForm {...props} medicine={props.medicine} />;
};

export default MedicineFormModal;
