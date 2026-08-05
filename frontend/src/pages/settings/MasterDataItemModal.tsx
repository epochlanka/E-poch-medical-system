import { useState } from 'react';
import { createMasterDataItem, updateMasterDataItem } from '../../lib/settings';
import type { MasterDataItem } from '../../lib/settings';
import { XIcon } from '../../components/layout/Icons';
import type { MasterDataTabDef } from './settingsUtils';

interface MasterDataItemModalProps {
  tab: MasterDataTabDef;
  item?: MasterDataItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const MasterDataItemModal = ({ tab, item, onClose, onSaved }: MasterDataItemModalProps) => {
  const isEdit = !!item;
  const [value, setValue] = useState(item?.value ?? '');
  const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!value.trim()) {
      setError('Value is required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateMasterDataItem(item!.item_id, { value: value.trim(), sort_order: Number(sortOrder) || 0 });
      } else {
        await createMasterDataItem({ type: tab.type, value: value.trim(), sort_order: Number(sortOrder) || 0 });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">{isEdit ? 'Edit Item' : `Add to ${tab.label}`}</h2>
            <p className="modal-subtitle">{tab.description}</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-field span-2">
            <label>Value</label>
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Sort Order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MasterDataItemModal;
