import { useEffect, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getCatalogMeta, getMedicineStats, updateMedicine } from '../../lib/medicines';
import type { MedicineCatalogRow } from '../../lib/medicines';
import {
  MedicineIcon,
  CheckCircleIcon,
  AlertIcon,
  XCircleIcon,
  ExpiryIcon,
  PlusIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  AdjustIcon,
  PurchaseOrderIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import StockOverviewDonut from './StockOverviewDonut';
import MedicineFormModal from './MedicineFormModal';
import ViewMedicineModal from './ViewMedicineModal';
import StockAdjustmentModal from './StockAdjustmentModal';
import AddStockBatchModal from './AddStockBatchModal';
import NewPurchaseOrderModal from './NewPurchaseOrderModal';
import MedicineInventoryTable from './MedicineInventoryTable';
import type { MedicineInventoryTableHandle } from './MedicineInventoryTable';
import { formatDate } from './pharmacyUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './pharmacy.css';

const useClickOutside = (onOutside: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onOutside]);
  return ref;
};

const RowMenu = ({
  medicine,
  onAdjust,
  onAddStockBatch,
  onToggleActive,
}: {
  medicine: MedicineCatalogRow;
  onAdjust: () => void;
  onAddStockBatch: () => void;
  onToggleActive: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="pat-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="pat-menu">
          <button
            onClick={() => {
              setOpen(false);
              onAdjust();
            }}
          >
            Adjust Stock
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onAddStockBatch();
            }}
          >
            Add Stock Batch
          </button>
          <button
            className={medicine.is_active ? 'danger' : ''}
            onClick={() => {
              setOpen(false);
              onToggleActive();
            }}
          >
            {medicine.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      )}
    </div>
  );
};

const Pharmacy = () => {
  const tableRef = useRef<MedicineInventoryTableHandle>(null);

  const [showAddMedicine, setShowAddMedicine] = useState(false);
  const [editMedicine, setEditMedicine] = useState<MedicineCatalogRow | null>(null);
  const [viewMedicine, setViewMedicine] = useState<MedicineCatalogRow | null>(null);
  const [adjustMedicine, setAdjustMedicine] = useState<MedicineCatalogRow | null | undefined>(undefined);
  const [batchMedicine, setBatchMedicine] = useState<MedicineCatalogRow | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getMedicineStats);
  const { data: meta, reload: reloadMeta } = useApiData(() => getCatalogMeta());

  const refreshAll = () => {
    tableRef.current?.reload();
    reloadStats();
    reloadMeta();
  };

  const handleToggleActive = async (medicine: MedicineCatalogRow) => {
    await updateMedicine(medicine.medicine_id, { is_active: !medicine.is_active });
    refreshAll();
  };

  const donutSegments = stats
    ? [
        { label: 'In Stock', value: stats.inStock, color: '#22c55e' },
        { label: 'Low Stock', value: stats.lowStock, color: '#f59e0b' },
        { label: 'Out of Stock', value: stats.outOfStock, color: '#ef4444' },
        { label: 'Expiring Soon', value: stats.expiringSoon, color: '#a855f7' },
      ]
    : [];

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Pharmacy</h1>
          <p>Home &gt; Pharmacy &gt; Medicine Stock</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => setShowAddMedicine(true)}>
            <PlusIcon /> Add Medicine
          </button>
          <button className="pat-btn" onClick={() => setAdjustMedicine(null)}>
            <AdjustIcon /> Stock Adjustment
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewPO(true)}>
            <PurchaseOrderIcon /> New Purchase Order
          </button>
        </div>
      </div>

      <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard
          icon={<MedicineIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Medicines"
          value={String(stats?.totalMedicines ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              Active catalog items
            </span>
          }
        />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="In Stock" value={String(stats?.inStock ?? 0)} loading={statsLoading} />
        <KpiCard icon={<AlertIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Low Stock" value={String(stats?.lowStock ?? 0)} loading={statsLoading} />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Out of Stock"
          value={String(stats?.outOfStock ?? 0)}
          loading={statsLoading}
        />
      </div>

      <div className="ph-layout">
        <div>
          <MedicineInventoryTable
            ref={tableRef}
            meta={meta}
            onView={(m) => setViewMedicine(m)}
            onAddStockBatch={(m) => setBatchMedicine(m)}
            renderActions={(m) => (
              <div className="pat-actions-cell">
                <button className="pat-icon-btn" onClick={() => setViewMedicine(m)} aria-label="View">
                  <EyeIcon />
                </button>
                <button className="pat-icon-btn" onClick={() => setEditMedicine(m)} aria-label="Edit">
                  <EditIcon />
                </button>
                <RowMenu
                  medicine={m}
                  onAdjust={() => setAdjustMedicine(m)}
                  onAddStockBatch={() => setBatchMedicine(m)}
                  onToggleActive={() => handleToggleActive(m)}
                />
              </div>
            )}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Stock Overview</h3>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {stats && <StockOverviewDonut segments={donutSegments} total={stats.totalMedicines} />}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Expiring Soon</h3>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {!statsLoading && (stats?.expiringList.length ?? 0) === 0 && <div className="card-empty">Nothing expiring in the next 90 days.</div>}
            {stats?.expiringList.map((e) => (
              <div className="alert-row" key={`${e.medicineId}-${e.expiryDate}`}>
                <div className="alert-icon amber">
                  <ExpiryIcon />
                </div>
                <div className="alert-text">
                  <strong>{e.medicineName}</strong>
                  <div className="pat-muted">
                    EXP: {formatDate(e.expiryDate)} · Qty: {e.qty}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowAddMedicine(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">Add Medicine</span>
              </button>
              <button className="qa-btn" onClick={() => setAdjustMedicine(null)}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <AdjustIcon />
                </div>
                <span className="qa-label">Stock Adjustment</span>
              </button>
              <button className="qa-btn" onClick={() => setShowNewPO(true)}>
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <PurchaseOrderIcon />
                </div>
                <span className="qa-label">New Purchase Order</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAddMedicine && (
        <MedicineFormModal
          meta={meta}
          onClose={() => setShowAddMedicine(false)}
          onSaved={() => {
            setShowAddMedicine(false);
            refreshAll();
          }}
        />
      )}

      {editMedicine && (
        <MedicineFormModal
          medicine={editMedicine}
          meta={meta}
          onClose={() => setEditMedicine(null)}
          onSaved={() => {
            setEditMedicine(null);
            refreshAll();
          }}
        />
      )}

      {viewMedicine && (
        <ViewMedicineModal
          medicine={viewMedicine}
          onClose={() => setViewMedicine(null)}
          onEdit={() => {
            setEditMedicine(viewMedicine);
            setViewMedicine(null);
          }}
        />
      )}

      {adjustMedicine !== undefined && (
        <StockAdjustmentModal
          medicine={adjustMedicine}
          onClose={() => setAdjustMedicine(undefined)}
          onSuccess={() => {
            setAdjustMedicine(undefined);
            refreshAll();
          }}
        />
      )}

      {batchMedicine && (
        <AddStockBatchModal
          medicine={batchMedicine}
          onClose={() => setBatchMedicine(null)}
          onSaved={() => {
            setBatchMedicine(null);
            refreshAll();
          }}
        />
      )}

      {showNewPO && (
        <NewPurchaseOrderModal
          onClose={() => setShowNewPO(false)}
          onSuccess={() => {
            setShowNewPO(false);
          }}
        />
      )}
    </div>
  );
};

export default Pharmacy;
