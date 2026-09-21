import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { listSuppliers, getSupplierStats, updateSupplier } from '../../lib/suppliers';
import type { Supplier } from '../../lib/suppliers';
import {
  SupplierIcon,
  CheckCircleIcon,
  FileIcon,
  DollarIcon,
  AlertIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PrintIcon,
  TruckIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import StockOverviewDonut from '../pharmacy/StockOverviewDonut';
import GoodsReceiveModal from '../purchaseOrders/GoodsReceiveModal';
import { formatCurrency } from '../purchaseOrders/purchaseOrderUtils';
import { initials } from '../patients/patientUtils';
import SupplierFormModal from './SupplierFormModal';
import ViewSupplierModal from './ViewSupplierModal';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../pharmacy/pharmacy.css';
import './suppliers.css';

const PER_PAGE_OPTIONS = [10, 20, 50];

const toCsv = (rows: Supplier[]) => {
  const header = ['Supplier Name', 'Contact Person', 'Phone', 'Email', 'City', 'Status', 'Total Orders', 'Total Payable'];
  const body = rows.map((s) => [
    s.name,
    s.contact_person ?? '',
    s.phone ?? '',
    s.email ?? '',
    s.city ?? '',
    s.is_active ? 'Active' : 'Inactive',
    String(s.totalOrders),
    s.totalPayable.toFixed(2),
  ]);
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...body].map((r) => r.map(escape).join(',')).join('\r\n');
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

const RowMenu = ({ supplier, onToggleActive }: { supplier: Supplier; onToggleActive: () => void }) => {
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
            className={supplier.is_active ? 'danger' : ''}
            onClick={() => {
              setOpen(false);
              onToggleActive();
            }}
          >
            {supplier.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      )}
    </div>
  );
};

const Suppliers = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [exporting, setExporting] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [showGoodsReceive, setShowGoodsReceive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getSupplierStats);
  const {
    data: suppliers,
    loading,
    error,
    reload,
  } = useApiData(() => listSuppliers({ search: search || undefined, includeInactive: status !== 'active' }), [search, status]);

  const cities = useMemo(() => Array.from(new Set((suppliers ?? []).map((s) => s.city).filter((c): c is string => !!c))).sort(), [suppliers]);

  const filtered = useMemo(() => {
    return (suppliers ?? []).filter((s) => {
      if (status === 'active' && !s.is_active) return false;
      if (status === 'inactive' && s.is_active) return false;
      if (city && s.city !== city) return false;
      return true;
    });
  }, [suppliers, status, city]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const pageSuppliers = filtered.slice((page - 1) * limit, page * limit);

  const refreshAll = () => {
    reload();
    reloadStats();
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus('all');
    setCity('');
    setPage(1);
  };

  const handleToggleActive = async (supplier: Supplier) => {
    await updateSupplier(supplier.supplier_id, { is_active: !supplier.is_active });
    refreshAll();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = toCsv(filtered);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const topSuppliers = useMemo(() => [...(suppliers ?? [])].sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 4), [suppliers]);

  const donutSegments = stats
    ? [
        { label: 'Active', value: stats.activeSuppliers, color: '#22c55e' },
        { label: 'Inactive', value: stats.totalSuppliers - stats.activeSuppliers, color: '#ef4444' },
      ]
    : [];

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [totalPages, page]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Suppliers</h1>
          <p>Home &gt; Suppliers</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export Report'}
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn primary" onClick={() => setShowAdd(true)}>
            <PlusIcon /> Add Supplier
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load suppliers: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<SupplierIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Suppliers"
          value={String(stats?.totalSuppliers ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatus('all')}>
              View all suppliers
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Active Suppliers"
          value={String(stats?.activeSuppliers ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.activeSuppliers / Math.max(stats.totalSuppliers, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<FileIcon />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          label="Total Orders"
          value={String(stats?.totalOrdersThisMonth ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>This Month</span>}
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#f3e8ff"
          iconColor="#9333ea"
          label="Total Payable"
          value={formatCurrency(stats?.totalPayable ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>View all payables</span>}
        />
        <KpiCard
          icon={<AlertIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Overdue Payables"
          value={formatCurrency(stats?.overduePayable ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>View overdue</span>}
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input
            ref={searchInputRef}
            placeholder="Search supplier name, contact, email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <select
          className="pat-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as 'all' | 'active' | 'inactive');
            setPage(1);
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          className="pat-select"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
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
                  <th>Supplier Name</th>
                  <th>Contact Person</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Total Orders</th>
                  <th>Total Payable</th>
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

                {!loading && pageSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="pat-empty">No suppliers match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  pageSuppliers.map((s, i) => (
                    <tr key={s.supplier_id}>
                      <td className="pat-muted">{(page - 1) * limit + i + 1}</td>
                      <td>
                        <div className="pat-name-cell">
                          <div className="pat-avatar">{initials(s.name)}</div>
                          <button className="pat-id-link" onClick={() => setViewSupplier(s)}>
                            {s.name}
                          </button>
                        </div>
                      </td>
                      <td>{s.contact_person || <span className="pat-muted">—</span>}</td>
                      <td>{s.phone || <span className="pat-muted">—</span>}</td>
                      <td>{s.email || <span className="pat-muted">—</span>}</td>
                      <td>{s.city || <span className="pat-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>{s.totalOrders}</td>
                      <td>{formatCurrency(s.totalPayable)}</td>
                      <td>
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" onClick={() => setViewSupplier(s)} aria-label="View">
                            <EyeIcon />
                          </button>
                          <button className="pat-icon-btn" onClick={() => setEditSupplier(s)} aria-label="Edit">
                            <EditIcon />
                          </button>
                          <RowMenu supplier={s} onToggleActive={() => handleToggleActive(s)} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, filtered.length)} of {filtered.length} suppliers
              </div>

              <div className="pat-pagination-pages">
                <button className="pat-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeftIcon />
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                      <button className={`pat-page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                <button className="pat-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRightIcon />
                </button>
              </div>

              <select
                className="pat-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
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
              <h3 className="card-title">Supplier Overview</h3>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {stats && <StockOverviewDonut segments={donutSegments} total={stats.totalSuppliers} />}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Top Suppliers (By Orders)</h3>
              <button className="card-link" onClick={() => setStatus('all')}>
                View All
              </button>
            </div>
            {loading && <div className="card-empty">Loading…</div>}
            {!loading && topSuppliers.length === 0 && <div className="card-empty">No suppliers yet.</div>}
            {topSuppliers.map((s) => (
              <div className="pat-name-cell" key={s.supplier_id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div className="pat-avatar">{initials(s.name)}</div>
                <div style={{ flex: 1 }}>
                  <div className="pat-name">{s.name}</div>
                  <div className="pat-muted">{s.totalOrders} Orders</div>
                </div>
                <span className="pat-name">{formatCurrency(s.totalPayable)}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowAdd(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">Add Supplier</span>
              </button>
              <button className="qa-btn" onClick={() => searchInputRef.current?.focus()}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <FileIcon />
                </div>
                <span className="qa-label">Supplier Statement</span>
              </button>
              <button className="qa-btn" onClick={() => setShowGoodsReceive(true)}>
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <TruckIcon />
                </div>
                <span className="qa-label">Goods Receive</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/reports')}>
                <div className="qa-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <FileIcon />
                </div>
                <span className="qa-label">Supplier Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <SupplierFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refreshAll();
          }}
        />
      )}

      {editSupplier && (
        <SupplierFormModal
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSaved={() => {
            setEditSupplier(null);
            refreshAll();
          }}
        />
      )}

      {viewSupplier && (
        <ViewSupplierModal
          supplier={viewSupplier}
          onClose={() => setViewSupplier(null)}
          onEdit={() => {
            setEditSupplier(viewSupplier);
            setViewSupplier(null);
          }}
        />
      )}

      {showGoodsReceive && (
        <GoodsReceiveModal
          onClose={() => setShowGoodsReceive(false)}
          onSuccess={() => {
            setShowGoodsReceive(false);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default Suppliers;
