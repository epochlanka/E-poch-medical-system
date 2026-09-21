import { useState } from 'react';
import { addStockBatch, PACK_UNITS } from '../../lib/medicines';
import type { MedicineCatalogRow } from '../../lib/medicines';
import { useApiData } from '../../hooks/useApiData';
import { listSuppliers } from '../../lib/suppliers';
import { XIcon, SaveIcon } from '../../components/layout/Icons';

interface AddStockBatchModalProps {
  medicine: MedicineCatalogRow;
  onClose: () => void;
  onSaved: () => void;
}

// The standalone "Add Stock Batch" action (Section 16/17) — adds a new Stock Batch to an
// EXISTING Medicine Product. Never creates a duplicate product; a different purchase price,
// selling price, expiry date and quantity from the last batch are all expected and fine.
const AddStockBatchModal = ({ medicine, onClose, onSaved }: AddStockBatchModalProps) => {
  const { data: suppliers } = useApiData(() => listSuppliers(), []);
  const [supplierId, setSupplierId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [manufactureDate, setManufactureDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [receivedUnit, setReceivedUnit] = useState(medicine.default_pack_unit || medicine.base_unit);
  const [receivedQty, setReceivedQty] = useState('');
  const [unitsPerPack, setUnitsPerPack] = useState(medicine.default_pack_size ? String(medicine.default_pack_size) : '1');
  const [purchasePricePerPack, setPurchasePricePerPack] = useState('');
  const [sellingPricePerPack, setSellingPricePerPack] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitsPerPackNum = Number(unitsPerPack) || 0;
  const purchasePriceNum = Number(purchasePricePerPack) || 0;
  const sellingPriceNum = Number(sellingPricePerPack) || 0;
  const costPerBaseUnit = unitsPerPackNum > 0 ? purchasePriceNum / unitsPerPackNum : 0;
  const sellPerBaseUnit = unitsPerPackNum > 0 ? sellingPriceNum / unitsPerPackNum : 0;

  const submit = async () => {
    setError(null);
    if (!supplierId) return setError('Choose a supplier.');
    if (!batchNo.trim()) return setError('Batch number is required.');
    if (!expiryDate) return setError('Expiry date is required.');
    if (new Date(expiryDate) <= new Date()) return setError('Expiry date must be in the future.');
    if (!receivedQty || Number(receivedQty) <= 0) return setError('Received quantity must be greater than zero.');
    if (unitsPerPackNum <= 0) return setError(`${medicine.base_unit} per ${receivedUnit} must be greater than zero.`);
    if (!purchasePricePerPack || purchasePriceNum < 0) return setError('Purchase price is required.');
    if (!sellingPricePerPack || sellingPriceNum <= 0) return setError('Selling price is required.');

    setSaving(true);
    try {
      await addStockBatch(medicine.medicine_id, {
        supplier_id: Number(supplierId),
        batch_no: batchNo.trim(),
        purchase_date: purchaseDate || undefined,
        manufacture_date: manufactureDate || undefined,
        expiry_date: expiryDate,
        received_unit: receivedUnit,
        received_qty: Number(receivedQty),
        units_per_pack: unitsPerPackNum,
        purchase_price_per_pack: purchasePriceNum,
        selling_price_per_pack: sellingPriceNum,
        location: location.trim() || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.details?.map((d: any) => d.message).join(', ') || err.response?.data?.message || 'Failed to add stock batch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 className="modal-title">Add Stock Batch</h3>
          <button type="button" className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
        <p className="modal-subtitle">
          {medicine.name}
          {medicine.brand_name ? ` (${medicine.brand_name})` : ''} — this adds a new batch, it does not create a new medicine.
        </p>

        <div className="modal-grid">
          <div className="modal-field">
            <label>Supplier *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
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
            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required />
          </div>
          <div className="modal-field">
            <label>Purchase Date</label>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Manufacturing Date (optional)</label>
            <input type="date" value={manufactureDate} onChange={(e) => setManufactureDate(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Expiry Date *</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
          </div>
          <div className="modal-field">
            <label>Received As *</label>
            <select value={receivedUnit} onChange={(e) => setReceivedUnit(e.target.value)}>
              {PACK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-field">
            <label>Purchase Quantity ({receivedUnit}) *</label>
            <input type="number" min={0} step="1" value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} required />
          </div>
          <div className="modal-field">
            <label>
              {medicine.base_unit} per {receivedUnit} *
            </label>
            <input type="number" min={0} value={unitsPerPack} onChange={(e) => setUnitsPerPack(e.target.value)} required />
          </div>
          <div className="modal-field">
            <label>Purchase Price per {receivedUnit} *</label>
            <input type="number" min={0} step="0.01" value={purchasePricePerPack} onChange={(e) => setPurchasePricePerPack(e.target.value)} required />
          </div>
          <div className="modal-field">
            <label>Selling Price per {receivedUnit} *</label>
            <input type="number" min={0} step="0.01" value={sellingPricePerPack} onChange={(e) => setSellingPricePerPack(e.target.value)} required />
          </div>
          <div className="modal-field span-2">
            <label>Storage Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Main Store / Shelf A-01" />
          </div>
          {unitsPerPackNum > 0 && (purchasePriceNum > 0 || sellingPriceNum > 0) && (
            <div className="modal-field span-2">
              <div className="wiz-calc-box">
                {receivedQty && Number(receivedQty) > 0 && (
                  <>
                    Quantity in base units: {(Number(receivedQty) * unitsPerPackNum).toLocaleString()} {medicine.base_unit} ·{' '}
                  </>
                )}
                Cost per {medicine.base_unit}: {costPerBaseUnit.toFixed(2)} · Selling price per {medicine.base_unit}: {sellPerBaseUnit.toFixed(2)} · Profit
                per {medicine.base_unit}: {(sellPerBaseUnit - costPerBaseUnit).toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="modal-btn primary" disabled={saving} onClick={submit}>
            <SaveIcon /> {saving ? 'Saving…' : 'Add Stock Batch'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddStockBatchModal;
