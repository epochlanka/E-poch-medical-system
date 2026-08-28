import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listMedicineStock, getMedicineStats, updateMedicine } from '../../lib/medicines';
import type { ListMedicineStockParams, MedicineStockRow, MedicineStockStatus } from '../../lib/medicines';
import { listMasterData } from '../../lib/settings';
import { listSuppliers } from '../../lib/suppliers';
import {
  MedicineIcon,
  CheckCircleIcon,
  AlertIcon,
  XCircleIcon,
  ExpiryIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AdjustIcon,
  PurchaseOrderIcon,
  StockIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import StockOverviewDonut from '../pharmacy/StockOverviewDonut';
import MedicineFormModal from '../pharmacy/MedicineFormModal';
import ViewMedicineModal from '../pharmacy/ViewMedicineModal';
import StockAdjustmentModal from '../pharmacy/StockAdjustmentModal';
import StockTransferModal from '../pharmacy/StockTransferModal';
import NewPurchaseOrderModal from '../pharmacy/NewPurchaseOrderModal';
import { medicineCode, categoryBadgeClass } from '../pharmacy/pharmacyUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../pharmacy/pharmacy.css';

const PER_PAGE_OPTIONS = [8, 20, 50, 100];

const TABS: { key: MedicineStockStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All Medicines' },
  { key: 'in-stock', label: 'In Stock' },
  { key: 'low-stock', label: 'Low Stock' },
  { key: 'out-of-stock', label: 'Out of Stock' },
  { key: 'expiring-soon', label: 'Expiring Soon' },
];

const STOCK_BADGE: Record<MedicineStockRow['stockStatus'], string> = {
  'in-stock': 'badge-green',
  low: 'badge-amber',
  'out-of-stock': 'badge-red',
};
const STOCK_LABEL: Record<MedicineStockRow['stockStatus'], string> = {
  'in-stock': 'In Stock',
  low: 'Low Stock',
  'out-of-stock': 'Out of Stock',
};

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
  onTransfer,
  onToggleActive,
}: {
  medicine: MedicineStockRow;
  onAdjust: () => void;
  onTransfer: () => void;
  onToggleActive: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
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
              onTransfer();
            }}
          >
            Transfer Stock
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

const StockManagement = () => {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListMedicineStockParams>({ page: 1, limit: 8 });
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<MedicineStockStatus | 'all'>('all');
  const [supplierId, setSupplierId] = useState('');

  const [showAddMedicine, setShowAddMedicine] = useState(false);
  const [editMedicine, setEditMedicine] = useState<MedicineStockRow | null>(null);
  const [viewMedicine, setViewMedicine] = useState<MedicineStockRow | null>(null);
  const [adjustMedicine, setAdjustMedicine] = useState<MedicineStockRow | null | undefined>(undefined);
  const [transferMedicine, setTransferMedicine] = useState<MedicineStockRow | null | undefined>(undefined);
  const [showNewPO, setShowNewPO] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getMedicineStats);
  const { data: result, loading, error, reload } = useApiData(() => listMedicineStock(filters), [JSON.stringify(filters)]);
  const { data: categories } = useApiData(() => listMasterData('MedicineCategory'));
  const { data: suppliers } = useApiData(() => listSuppliers());

  const medicines = result?.data ?? [];
  const pagination = result?.pagination;

  const refreshAll = () => {
    reload();
    reloadStats();
  };

  const setTab = (key: MedicineStockStatus | 'all') => {
    setStatus(key);
    setFilters((f) => ({ ...f, status: key === 'all' ? undefined : key, page: 1 }));
  };

  const setCategoryFilter = (value: string) => {
    setCategory(value);
    setFilters((f) => ({ ...f, category: value || undefined, page: 1 }));
  };

  const setSupplierFilter = (value: string) => {
    setSupplierId(value);
    setFilters((f) => ({ ...f, supplierId: value ? Number(value) : undefined, page: 1 }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setCategory('');
    setStatus('all');
    setSupplierId('');
    setFilters({ page: 1, limit: filters.limit });
  };

  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleToggleActive = async (medicine: MedicineStockRow) => {
    await updateMedicine(medicine.medicine_id, { is_active: !medicine.is_active });
    refreshAll();
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

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
          <h1>Stock Management</h1>
          <p>Home &gt; Stock Management</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => setAdjustMedicine(null)}>
            <AdjustIcon /> Stock Adjustment
          </button>
          <button className="pat-btn" onClick={() => setTransferMedicine(null)}>
            <StockIcon /> Stock Transfer
          </button>
          <button className="pat-btn" onClick={() => setShowAddMedicine(true)}>
            <PlusIcon /> Add Medicine
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewPO(true)}>
            <PurchaseOrderIcon /> New Purchase Order
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load stock: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<MedicineIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Medicines"
          value={String(stats?.totalMedicines ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              View all medicines
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="In Stock"
          value={String(stats?.inStock ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.inStock / Math.max(stats.totalMedicines, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<AlertIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Low Stock"
          value={String(stats?.lowStock ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => setTab('low-stock')}>
              View low stock
            </span>
          }
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Out of Stock"
          value={String(stats?.outOfStock ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => setTab('out-of-stock')}>
              View out of stock
            </span>
          }
        />
        <KpiCard
          icon={<ExpiryIcon />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          label="Expiring Soon"
          value={String(stats?.expiringSoon ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => setTab('expiring-soon')}>
              View expiring soon
            </span>
          }
        />
      </div>

      <div className="ph-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`ph-tab${status === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search medicine by name, generic name or code…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={category} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.item_id} value={c.value}>
              {c.value}
            </option>
          ))}
        </select>

        <select className="pat-select" value={supplierId} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="">All Suppliers</option>
          {(suppliers ?? []).map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="pat-select" value={status} onChange={(e) => setTab(e.target.value as MedicineStockStatus | 'all')}>
          <option value="all">All Status</option>
          <option value="in-stock">In Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="expiring-soon">Expiring Soon</option>
        </select>

        <button className="pat-btn" onClick={reload}>
          <FilterIcon /> Filter
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      <div className="ph-layout">
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicine Details</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Current Stock</th>
                  <th>Min Stock</th>
                  <th>Max Stock</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}

                {!loading && medicines.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="pat-empty">No medicines match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  medicines.map((m, i) => (
                    <tr key={m.medicine_id}>
                      <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 8) + i + 1}</td>
                      <td>
                        <div className="ph-med-cell">
                          <div className="ph-med-icon">
                            <MedicineIcon />
                          </div>
                          <div>
                            <button className="pat-id-link" style={{ display: 'block' }} onClick={() => setViewMedicine(m)}>
                              {m.name}
                            </button>
                            <span className="pat-muted" style={{ fontSize: 11.5 }}>
                              {medicineCode(m.medicine_id)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {m.category ? <span className={`badge ${categoryBadgeClass(m.category)}`}>{m.category}</span> : <span className="pat-muted">—</span>}
                      </td>
                      <td>{m.unit}</td>
                      <td>{m.totalQty}</td>
                      <td>{m.reorder_level}</td>
                      <td>{m.max_stock_level || <span className="pat-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${STOCK_BADGE[m.stockStatus]}`}>{STOCK_LABEL[m.stockStatus]}</span>
                      </td>
                      <td>{m.location || <span className="pat-muted">—</span>}</td>
                      <td>
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
                            onTransfer={() => setTransferMedicine(m)}
                            onToggleActive={() => handleToggleActive(m)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} medicines
              </div>

              <div className="pat-pagination-pages">
                <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                  <ChevronLeftIcon />
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                      <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => goToPage(p)}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
                  <ChevronRightIcon />
                </button>
              </div>

              <select className="pat-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Stock Overview</h3>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {stats && <StockOverviewDonut segments={donutSegments} total={stats.totalMedicines} />}
            <a href="/reports" className="pat-btn" style={{ marginTop: 14, justifyContent: 'center' }}>
              View Full Report
            </a>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Top Low Stock Medicines</h3>
              <button className="card-link" onClick={() => setTab('low-stock')}>
                View All
              </button>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {!statsLoading && (stats?.lowStockList.length ?? 0) === 0 && <div className="card-empty">No medicines are currently low on stock.</div>}
            {stats?.lowStockList.map((l) => (
              <div className="alert-row" key={l.medicineId}>
                <div className="alert-icon amber">
                  <AlertIcon />
                </div>
                <div className="alert-text">
                  <strong>{l.medicineName}</strong>
                  <div className="pat-muted">
                    Current Stock: {l.totalQty} &nbsp;·&nbsp; Min Stock: {l.reorderLevel}
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
              <button className="qa-btn" onClick={() => setTransferMedicine(null)}>
                <div className="qa-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <StockIcon />
                </div>
                <span className="qa-label">Stock Transfer</span>
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
          categories={(categories ?? []).map((c) => c.value)}
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
          categories={(categories ?? []).map((c) => c.value)}
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

      {transferMedicine !== undefined && (
        <StockTransferModal
          medicine={transferMedicine}
          onClose={() => setTransferMedicine(undefined)}
          onSuccess={() => {
            setTransferMedicine(undefined);
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

export default StockManagement;
