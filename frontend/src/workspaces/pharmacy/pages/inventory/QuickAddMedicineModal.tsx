import { useEffect, useRef, useState } from 'react';
import { createMedicine, BASE_UNITS, DOSAGE_FORMS, defaultBaseUnitForForm } from '../../lib/medicines';
import { useFeedback } from '../../../../shared/ui/feedback';
import { XIcon, SaveIcon, PlusIcon } from '../../components/layout/Icons';

/*
 * Getting a shelf full of medicines into the system for the first time.
 *
 * The full "Add New Medicine" form asks for around twenty fields across two steps. Nobody is
 * going to do that several hundred times at go-live, so this is the short path: the seven things
 * you cannot work out from the packet, entered in one screen, saved, and straight back to an
 * empty form for the next box. Supplier, batch number, cost price, category, manufacturer and
 * barcode are all left to the server's defaults — they can be filled in later from the catalog,
 * and none of them stop a medicine being dispensed.
 */

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const todayPlusMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

const emptyForm = () => ({
  name: '',
  form: 'Tablet',
  base_unit: 'Tablet',
  strength: '',
  qty: '',
  sell_price: '',
  expiry: '',
});

const QuickAddMedicineModal = ({ onClose, onSaved }: Props) => {
  const { toast } = useFeedback();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedThisSession, setAddedThisSession] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    nameRef.current?.focus();
  }, []);

  const set = (field: keyof ReturnType<typeof emptyForm>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // Picking a dosage form implies the unit its stock is counted in — syrups in ml, creams in
  // grams — so the pharmacist does not have to think about it.
  const setDosageForm = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, form: e.target.value, base_unit: defaultBaseUnitForForm(e.target.value) }));

  const qtyNum = Number(form.qty);
  const priceNum = Number(form.sell_price);
  const canSave =
    form.name.trim().length > 0 &&
    form.base_unit.trim().length > 0 &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    form.expiry.length > 0;

  const save = async (addAnother: boolean) => {
    if (!canSave || saving) return;
    setError(null);
    setSaving(true);
    try {
      await createMedicine({
        name: form.name.trim(),
        form: form.form || undefined,
        strength: form.strength.trim() || undefined,
        base_unit: form.base_unit,
        default_selling_price: priceNum,
        // One batch holding everything currently on the shelf. Received as loose base units, so
        // no pack-size arithmetic is needed: 240 tablets is just 240.
        initial_stock: {
          expiry_date: form.expiry,
          received_unit: form.base_unit,
          received_qty: qtyNum,
          units_per_pack: 1,
          selling_price_per_base_unit: priceNum,
        },
      });
      const saved = form.name.trim();
      setAddedThisSession((list) => [saved, ...list].slice(0, 8));
      toast(`${saved} added with ${qtyNum} ${form.base_unit.toLowerCase()}.`, 'success');
      onSaved();
      if (addAnother) {
        // Keep form and unit — a run of entries is usually the same kind of thing.
        setForm((prev) => ({ ...emptyForm(), form: prev.form, base_unit: prev.base_unit }));
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save this medicine.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal-dialog qam-dialog" aria-labelledby="qam-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="modal-card qam-card">
        <div className="qam-head">
          <div>
            <h2 className="modal-title" id="qam-title">Add medicine</h2>
            <p className="modal-subtitle">Just what is on the packet. Everything else can wait.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="qam-grid">
          <div className="modal-field qam-span">
            <label htmlFor="qam-name">Medicine name *</label>
            <input id="qam-name" ref={nameRef} value={form.name} onChange={set('name')} placeholder="e.g. Amoxicillin" autoComplete="off" />
          </div>

          <div className="modal-field">
            <label htmlFor="qam-form">Form</label>
            <select id="qam-form" value={form.form} onChange={setDosageForm}>
              {DOSAGE_FORMS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div className="modal-field">
            <label htmlFor="qam-strength">Strength</label>
            <input id="qam-strength" value={form.strength} onChange={set('strength')} placeholder="e.g. 250mg" autoComplete="off" />
          </div>

          <div className="modal-field">
            <label htmlFor="qam-qty">Quantity on shelf *</label>
            <div className="qam-inline">
              <input id="qam-qty" type="number" min="1" step="1" value={form.qty} onChange={set('qty')} placeholder="0" />
              <select value={form.base_unit} onChange={set('base_unit')} aria-label="Unit">
                {BASE_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <small>Count in single {form.base_unit.toLowerCase()}s, not boxes.</small>
          </div>

          <div className="modal-field">
            <label htmlFor="qam-price">Selling price per {form.base_unit.toLowerCase()} *</label>
            <input id="qam-price" type="number" min="0" step="0.01" value={form.sell_price} onChange={set('sell_price')} placeholder="0.00" />
          </div>

          <div className="modal-field qam-span">
            <label htmlFor="qam-expiry">Expiry date *</label>
            <input id="qam-expiry" type="date" min={new Date().toISOString().slice(0, 10)} value={form.expiry} onChange={set('expiry')} />
            <div className="qam-shortcuts">
              {[6, 12, 24].map((months) => (
                <button type="button" key={months} onClick={() => setForm((p) => ({ ...p, expiry: todayPlusMonths(months) }))}>
                  +{months} months
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="modal-error">{error}</div>}

        {addedThisSession.length > 0 && (
          <div className="qam-added">
            <strong>Added just now ({addedThisSession.length})</strong>
            <span>{addedThisSession.join(' · ')}</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={saving}>
            {addedThisSession.length > 0 ? 'Done' : 'Cancel'}
          </button>
          <button className="modal-btn secondary" onClick={() => void save(false)} disabled={!canSave || saving}>
            <SaveIcon /> Save &amp; close
          </button>
          <button className="modal-btn primary" onClick={() => void save(true)} disabled={!canSave || saving}>
            <PlusIcon /> {saving ? 'Saving…' : 'Save & add another'}
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default QuickAddMedicineModal;
