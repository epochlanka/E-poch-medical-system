import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getCatalogMeta, listMedicineCatalog, updateMedicine, getMedicineWithBatches } from '../../lib/medicines';
import type { MedicineCatalogRow, MedicineWithBatches } from '../../lib/medicines';
import KpiCard from '../dashboard/KpiCard';
import MedicineFormModal from './MedicineFormModal';
import AddStockBatchModal from './AddStockBatchModal';
import ImportMedicinesModal from './ImportMedicinesModal';
import {
  MedicineIcon,
  CheckCircleIcon,
  XCircleIcon,
  StockIcon,
  SupplierIcon,
  PlusIcon,
  UploadIcon,
  SearchIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  TruckIcon,
} from '../../components/layout/Icons';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../prescriptions/prescriptions.css';

const money = (n: number) => `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stockStatusLabel: Record<MedicineCatalogRow['stockStatus'], string> = { 'in-stock': 'In Stock', low: 'Low Stock', 'out-of-stock': 'Out of Stock' };
const stockStatusBadge: Record<MedicineCatalogRow['stockStatus'], string> = { 'in-stock': 'badge-green', low: 'badge-amber', 'out-of-stock': 'badge-red' };

const BatchesRow = ({ medicineId, onAddBatch }: { medicineId: number; onAddBatch: () => void }) => {
  const { data, loading } = useApiData<MedicineWithBatches>(() => getMedicineWithBatches(medicineId), [medicineId]);
  return (
    <tr>
      <td colSpan={11} style={{ background: '#f8fafc', padding: '10px 16px' }}>
        {loading && <div className="pat-muted">Loading batches…</div>}
        {!loading && data && data.batches.length === 0 && (
          <div className="pat-muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>No stock batches yet for this medicine.</span>
            <button className="pat-btn primary" onClick={onAddBatch}>
              <TruckIcon /> Add Stock Batch
            </button>
          </div>
        )}
        {!loading && data && data.batches.length > 0 && (
          <div>
            <table className="pat-table" style={{ background: 'white', borderRadius: 8 }}>
              <thead>
                <tr>
                  <th>Batch No</th>
                  <th>Supplier</th>
                  <th>Received</th>
                  <th>Qty Remaining</th>
                  <th>Expiry</th>
                  <th>Cost / {data.base_unit}</th>
                  <th>Sell / {data.base_unit}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map((b) => (
                  <tr key={b.batch_id}>
                    <td>{b.batch_no}</td>
                    <td>{b.supplier?.name || '—'}</td>
                    <td>
                      {b.received_qty} {b.received_unit}
                    </td>
                    <td>
                      {b.qty_on_hand} {data.base_unit}
                    </td>
                    <td>{new Date(b.expiry_date).toLocaleDateString()}</td>
                    <td>{b.cost_per_base_unit.toFixed(2)}</td>
                    <td>{b.selling_price_per_base_unit.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${b.status === 'Active' ? 'badge-green' : b.status === 'Expired' ? 'badge-red' : 'badge-gray'}`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="pat-btn" onClick={onAddBatch}>
                <TruckIcon /> Add Stock Batch
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
};

const MedicineCatalog = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [form, setFormFilter] = useState('');
  const [brand, setBrand] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all' | ''>('');
  const [stockStatus, setStockStatus] = useState<'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon' | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [modal, setModal] = useState<{ mode: 'add' | 'edit' | 'view'; medicine?: MedicineCatalogRow } | null>(null);
  const [batchModal, setBatchModal] = useState<MedicineCatalogRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: meta, reload: reloadMeta } = useApiData(() => getCatalogMeta(), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, category, form, brand, manufacturer, batchNo, status, stockStatus]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const params = useMemo(
    () => ({
      search: search || undefined,
      category: category || undefined,
      form: form || undefined,
      brand: brand || undefined,
      manufacturer: manufacturer || undefined,
      batchNo: batchNo || undefined,
      status: (status || undefined) as 'active' | 'inactive' | 'all' | undefined,
      stockStatus: (stockStatus || undefined) as 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon' | undefined,
      page,
      limit,
    }),
    [search, category, form, brand, manufacturer, batchNo, status, stockStatus, page, limit]
  );

  const { data: result, loading, reload: reloadList } = useApiData(() => listMedicineCatalog(params), [params]);
  const rows = result?.data ?? [];
  const pagination = result?.pagination;

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setFormFilter('');
    setBrand('');
    setManufacturer('');
    setBatchNo('');
    setStatus('');
    setStockStatus('');
  };

  const reloadAll = () => {
    reloadList();
    reloadMeta();
  };

  const toggleActive = async (m: MedicineCatalogRow) => {
    setOpenMenuId(null);
    await updateMedicine(m.medicine_id, { is_active: !m.is_active });
    reloadAll();
  };

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <MedicineIcon />
            </span>
            Medicine Catalog
          </h1>
          <p>Browse, search and manage medicine products and their stock batches.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => setImportOpen(true)}>
            <UploadIcon /> Import Medicines
          </button>
          <button className="pat-btn primary" onClick={() => setModal({ mode: 'add' })}>
            <PlusIcon /> Add New Medicine
          </button>
        </div>
      </div>

      <div className="dash-kpi-row">
        <KpiCard icon={<StockIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Medicines" value={String(meta?.stats.total ?? 0)} loading={!meta} />
        <KpiCard icon={<CheckCircleIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Active Medicines" value={String(meta?.stats.active ?? 0)} loading={!meta} />
        <KpiCard icon={<XCircleIcon />} iconBg="#fee2e2" iconColor="#dc2626" label="Inactive Medicines" value={String(meta?.stats.inactive ?? 0)} loading={!meta} />
        <KpiCard
          icon={<MedicineIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Therapeutic Classes"
          value={String(meta?.stats.therapeuticClassCount ?? 0)}
          loading={!meta}
        />
        <KpiCard icon={<SupplierIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Manufacturers" value={String(meta?.stats.manufacturerCount ?? 0)} loading={!meta} />
      </div>

      <div className="pat-filter-bar" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <div className="pat-search" style={{ flex: 1, maxWidth: 260 }}>
          <SearchIcon />
          <input placeholder="Search name, generic, brand, code…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="pat-select" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Brand: All</option>
          {meta?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select className="pat-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Category: All</option>
          {meta?.therapeuticClasses.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="pat-select" value={form} onChange={(e) => setFormFilter(e.target.value)}>
          <option value="">Dosage Form: All</option>
          {meta?.dosageForms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select className="pat-select" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
          <option value="">Manufacturer: All</option>
          {meta?.manufacturers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input className="pat-select" style={{ width: 140 }} placeholder="Batch no…" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
        <select className="pat-select" value={stockStatus} onChange={(e) => setStockStatus(e.target.value as any)}>
          <option value="">Stock: All</option>
          <option value="in-stock">In Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="expiring-soon">Expiring Soon</option>
        </select>
        <select className="pat-select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="pat-btn" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th></th>
                <th>Medicine Code</th>
                <th>Medicine (Brand / Generic)</th>
                <th>Form / Strength</th>
                <th>Base Unit</th>
                <th>Stock</th>
                <th>Sell Price</th>
                <th>Nearest Expiry</th>
                <th>Stock Status</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="pat-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="pat-empty">No medicines match this filter.</div>
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((m) => (
                  <Fragment key={m.medicine_id}>
                    <tr>
                      <td>
                        <button
                          className="pat-icon-btn"
                          title="Show batches"
                          onClick={() => setExpandedId(expandedId === m.medicine_id ? null : m.medicine_id)}
                          style={{ transform: expandedId === m.medicine_id ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
                        >
                          <ChevronDownIcon />
                        </button>
                      </td>
                      <td>{m.code}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {m.name}
                          {m.brand_name && <span className="pat-muted" style={{ fontWeight: 400 }}> · {m.brand_name}</span>}
                        </div>
                        {m.generic_name && (
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            ({m.generic_name})
                          </span>
                        )}
                      </td>
                      <td>
                        {m.form || '—'} {m.strength ? `· ${m.strength}` : ''}
                      </td>
                      <td>{m.base_unit}</td>
                      <td>
                        {m.totalQty.toLocaleString()} {m.base_unit}
                        {m.batchCount > 0 && <span className="pat-muted" style={{ fontSize: 11 }}> ({m.batchCount} batch{m.batchCount === 1 ? '' : 'es'})</span>}
                      </td>
                      <td>{money(m.sell_price)}</td>
                      <td>{m.nearestExpiry ? new Date(m.nearestExpiry).toLocaleDateString() : '—'}</td>
                      <td>
                        <span className={`badge ${stockStatusBadge[m.stockStatus]}`}>{stockStatusLabel[m.stockStatus]}</span>
                        {m.isExpiringSoon && <span className="badge badge-amber" style={{ marginLeft: 4 }}>Expiring Soon</span>}
                      </td>
                      <td>
                        <span className={`badge ${m.is_active ? 'badge-green' : 'badge-red'}`}>{m.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
                          <button className="pat-icon-btn" title="Add Stock Batch" onClick={() => setBatchModal(m)}>
                            <TruckIcon />
                          </button>
                          <button className="pat-icon-btn" title="View" onClick={() => setModal({ mode: 'view', medicine: m })}>
                            <EyeIcon />
                          </button>
                          <button className="pat-icon-btn" title="Edit" onClick={() => setModal({ mode: 'edit', medicine: m })}>
                            <EditIcon />
                          </button>
                          <button className="pat-icon-btn" title="More" onClick={() => setOpenMenuId(openMenuId === m.medicine_id ? null : m.medicine_id)}>
                            <MoreVerticalIcon />
                          </button>
                          {openMenuId === m.medicine_id && (
                            <div ref={menuRef} className="pat-menu">
                              <button onClick={() => toggleActive(m)}>{m.is_active ? 'Deactivate' : 'Reactivate'}</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === m.medicine_id && <BatchesRow medicineId={m.medicine_id} onAddBatch={() => setBatchModal(m)} />}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && (
          <div className="pat-pagination">
            <div className="pat-pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} entries
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <select
                className="pat-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
              </select>
              <div className="pat-pagination-pages">
                <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>
                  <ChevronLeftIcon />
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                      <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => setPage(p)}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <MedicineFormModal
          mode={modal.mode}
          medicine={modal.medicine}
          meta={meta ?? undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reloadAll();
          }}
        />
      )}

      {batchModal && (
        <AddStockBatchModal
          medicine={batchModal}
          onClose={() => setBatchModal(null)}
          onSaved={() => {
            setBatchModal(null);
            reloadAll();
          }}
        />
      )}

      {importOpen && (
        <ImportMedicinesModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            reloadAll();
          }}
        />
      )}
    </div>
  );
};

export default MedicineCatalog;
