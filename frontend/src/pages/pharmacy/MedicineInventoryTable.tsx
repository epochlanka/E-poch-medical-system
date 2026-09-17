import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getMedicineWithBatches, listMedicineCatalog } from '../../lib/medicines';
import type { CatalogMeta, MedicineCatalogRow, MedicineWithBatches } from '../../lib/medicines';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, FilterIcon, RefreshIcon, SearchIcon, TruckIcon } from '../../components/layout/Icons';
import { formatCurrency, formatDate, medicineCode } from './pharmacyUtils';

const COLUMN_COUNT = 11;
const PER_PAGE_OPTIONS = [8, 20, 50, 100];

const STOCK_BADGE: Record<MedicineCatalogRow['stockStatus'], string> = {
  'in-stock': 'badge-green',
  low: 'badge-amber',
  'out-of-stock': 'badge-red',
};
const STOCK_LABEL: Record<MedicineCatalogRow['stockStatus'], string> = {
  'in-stock': 'In Stock',
  low: 'Low Stock',
  'out-of-stock': 'Out of Stock',
};

// One expandable row per medicine, lazily fetching its batches (Section 13/17) only once opened —
// FEFO-ordered by the backend, same order dispensing would draw from.
const BatchesRow = ({ medicineId, onAddBatch }: { medicineId: number; onAddBatch: () => void }) => {
  const { data, loading } = useApiData<MedicineWithBatches>(() => getMedicineWithBatches(medicineId), [medicineId]);

  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="med-batches-panel">
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
            <table className="pat-table">
              <thead>
                <tr>
                  <th>Batch No</th>
                  <th>Supplier</th>
                  <th>Received</th>
                  <th>Qty Remaining</th>
                  <th>Expiry</th>
                  <th>Cost / {data.base_unit}</th>
                  <th>Sell / {data.base_unit}</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map((b) => (
                  <tr key={b.batch_id}>
                    <td>{b.batch_no}</td>
                    <td>{b.supplier?.name || <span className="pat-muted">—</span>}</td>
                    <td>
                      {b.received_qty} {b.received_unit}
                    </td>
                    <td>
                      {b.qty_on_hand} {data.base_unit}
                    </td>
                    <td>{formatDate(b.expiry_date)}</td>
                    <td>{formatCurrency(b.cost_per_base_unit)}</td>
                    <td>{formatCurrency(b.selling_price_per_base_unit)}</td>
                    <td>{b.location || <span className="pat-muted">—</span>}</td>
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

export interface MedicineInventoryTableHandle {
  reload: () => void;
}

interface MedicineInventoryTableProps {
  meta?: CatalogMeta | null;
  onView: (m: MedicineCatalogRow) => void;
  onAddStockBatch: (m: MedicineCatalogRow) => void;
  renderActions: (m: MedicineCatalogRow) => ReactNode;
  /** Only active medicines by default — Medicine Status filter lets the user widen this. */
  defaultStatus?: 'active' | 'inactive' | 'all';
}

// Shared by Medicines / Pharmacy / Stock Management — the one paginated, filterable inventory
// table (Section 10 "Inventory Display") each of those pages builds its own header/KPIs/quick
// actions around. Each medicine row expands to its stock batches inline (Section 17).
const MedicineInventoryTable = forwardRef<MedicineInventoryTableHandle, MedicineInventoryTableProps>(
  ({ meta, onView, onAddStockBatch, renderActions, defaultStatus = 'active' }, ref) => {
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [form, setFormFilter] = useState('');
    const [brand, setBrand] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [batchNo, setBatchNo] = useState('');
    const [status, setStatus] = useState<'active' | 'inactive' | 'all'>(defaultStatus);
    const [stockStatus, setStockStatus] = useState<'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon' | ''>('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(8);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
      const t = setTimeout(() => setSearch(searchInput.trim()), 300);
      return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
      setPage(1);
    }, [search, category, form, brand, manufacturer, batchNo, status, stockStatus]);

    const params = useMemo(
      () => ({
        search: search || undefined,
        category: category || undefined,
        form: form || undefined,
        brand: brand || undefined,
        manufacturer: manufacturer || undefined,
        batchNo: batchNo || undefined,
        status,
        stockStatus: (stockStatus || undefined) as 'in-stock' | 'low-stock' | 'out-of-stock' | 'expiring-soon' | undefined,
        page,
        limit,
      }),
      [search, category, form, brand, manufacturer, batchNo, status, stockStatus, page, limit]
    );

    const { data: result, loading, reload } = useApiData(() => listMedicineCatalog(params), [JSON.stringify(params)]);
    useImperativeHandle(ref, () => ({ reload }), [reload]);

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
      setStatus(defaultStatus);
      setStockStatus('');
      setPage(1);
    };

    return (
      <>
        <div className="pat-filter-bar" style={{ flexWrap: 'wrap', rowGap: 8 }}>
          <div className="pat-search">
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
          <input className="pat-select" style={{ width: 130 }} placeholder="Batch no…" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
          <select className="pat-select" value={stockStatus} onChange={(e) => setStockStatus(e.target.value as typeof stockStatus)}>
            <option value="">Stock: All</option>
            <option value="in-stock">In Stock</option>
            <option value="low-stock">Low Stock</option>
            <option value="out-of-stock">Out of Stock</option>
            <option value="expiring-soon">Expiring Soon</option>
          </select>
          <select className="pat-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">Status: Active</option>
            <option value="inactive">Status: Inactive</option>
            <option value="all">Status: All</option>
          </select>
          <button className="pat-btn" onClick={reload}>
            <FilterIcon /> Filter
          </button>
          <button className="pat-btn" onClick={resetFilters}>
            <RefreshIcon /> Reset
          </button>
        </div>

        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Code</th>
                  <th>Medicine</th>
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
                    <td colSpan={COLUMN_COUNT} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMN_COUNT}>
                      <div className="pat-empty">No medicines match these filters.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((m) => (
                    <Fragment key={m.medicine_id}>
                      <tr>
                        <td>
                          <button
                            className={`pat-icon-btn med-expand-btn${expandedId === m.medicine_id ? ' open' : ''}`}
                            title="Show batches"
                            onClick={() => setExpandedId(expandedId === m.medicine_id ? null : m.medicine_id)}
                          >
                            <ChevronDownIcon />
                          </button>
                        </td>
                        <td className="pat-muted">{m.code || medicineCode(m.medicine_id)}</td>
                        <td>
                          <div className="ph-med-cell">
                            <div>
                              <button className="pat-id-link" style={{ display: 'block' }} onClick={() => onView(m)}>
                                {m.name}
                              </button>
                              <span className="pat-muted" style={{ fontSize: 11.5 }}>
                                {[m.brand_name, m.generic_name].filter(Boolean).join(' · ') || '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {m.form || '—'} {m.strength ? `· ${m.strength}` : ''}
                        </td>
                        <td>{m.base_unit}</td>
                        <td>
                          {m.totalQty.toLocaleString()} {m.base_unit}
                          {m.batchCount > 0 && (
                            <span className="pat-muted" style={{ fontSize: 11 }}>
                              {' '}
                              ({m.batchCount} batch{m.batchCount === 1 ? '' : 'es'})
                            </span>
                          )}
                        </td>
                        <td>{formatCurrency(m.sell_price)}</td>
                        <td>{m.nearestExpiry ? formatDate(m.nearestExpiry) : <span className="pat-muted">—</span>}</td>
                        <td>
                          <span className={`badge ${STOCK_BADGE[m.stockStatus]}`}>{STOCK_LABEL[m.stockStatus]}</span>
                          {m.isExpiringSoon && (
                            <span className="badge badge-purple" style={{ marginLeft: 4 }}>
                              Expiring
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${m.is_active ? 'badge-green' : 'badge-gray'}`}>{m.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td>{renderActions(m)}</td>
                      </tr>
                      {expandedId === m.medicine_id && <BatchesRow medicineId={m.medicine_id} onAddBatch={() => onAddStockBatch(m)} />}
                    </Fragment>
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

              <select className="pat-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </>
    );
  }
);

MedicineInventoryTable.displayName = 'MedicineInventoryTable';

export default MedicineInventoryTable;
