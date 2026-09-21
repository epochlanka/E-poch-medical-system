import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listMasterData, updateMasterDataItem, deleteMasterDataItem } from '../../lib/settings';
import type { MasterDataItem } from '../../lib/settings';
import { PlusIcon, EditIcon, TrashIcon } from '../../components/layout/Icons';
import { MASTER_DATA_TABS } from './settingsUtils';
import MasterDataItemModal from './MasterDataItemModal';

const MasterDataTab = () => {
  const [activeType, setActiveType] = useState(MASTER_DATA_TABS[0].type);
  const [showInactive, setShowInactive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<MasterDataItem | null>(null);

  const tab = MASTER_DATA_TABS.find((t) => t.type === activeType)!;
  const { data: items, loading, error, reload } = useApiData(() => listMasterData(activeType, showInactive), [activeType, showInactive]);

  const handleToggleActive = async (item: MasterDataItem) => {
    await updateMasterDataItem(item.item_id, { is_active: !item.is_active });
    reload();
  };

  const handleDelete = async (item: MasterDataItem) => {
    if (!window.confirm(`Permanently delete "${item.value}"? This cannot be undone.`)) return;
    await deleteMasterDataItem(item.item_id);
    reload();
  };

  return (
    <div className="card">
      <div className="ur-tabs" style={{ marginBottom: 14 }}>
        {MASTER_DATA_TABS.map((t) => (
          <button key={t.type} className={`ur-tab${t.type === activeType ? ' active' : ''}`} onClick={() => setActiveType(t.type)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rp-panel-header">
        <span className="card-subtitle">{tab.description}</span>
        <div className="rp-panel-controls">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748b' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ width: 'auto' }} />
            Show inactive
          </label>
          <button className="pat-btn primary" onClick={() => setShowAdd(true)}>
            <PlusIcon /> Add Item
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load {tab.label}: {error}</div>}

      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Value</th>
              <th>Sort Order</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="pat-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && (items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="pat-empty">No items yet.</div>
                </td>
              </tr>
            )}
            {!loading &&
              items?.map((item) => (
                <tr key={item.item_id}>
                  <td>{item.value}</td>
                  <td className="pat-muted">{item.sort_order}</td>
                  <td>
                    <span className={`badge ${item.is_active ? 'badge-green' : 'badge-gray'}`}>{item.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div className="pat-actions-cell">
                      <button className="pat-icon-btn" onClick={() => setEditItem(item)} aria-label="Edit">
                        <EditIcon />
                      </button>
                      <button className="pat-btn" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => handleToggleActive(item)}>
                        {item.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="pat-icon-btn" onClick={() => handleDelete(item)} aria-label="Delete">
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <MasterDataItemModal
          tab={tab}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            reload();
          }}
        />
      )}

      {editItem && (
        <MasterDataItemModal
          tab={tab}
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default MasterDataTab;
