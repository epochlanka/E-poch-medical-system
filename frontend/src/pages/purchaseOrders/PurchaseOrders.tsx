import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import {
  listPurchaseOrders,
  getPurchaseOrderStats,
  getTopSuppliers,
  listSuppliers,
  submitPurchaseOrder,
  closePurchaseOrder,
  cancelPurchaseOrder,
} from '../../lib/suppliers';
import type { ListPurchaseOrdersParams, PurchaseOrder, PurchaseOrderStatus, PoRange } from '../../lib/suppliers';
import {
  PurchaseOrderIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  XCircleIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PrintIcon,
  SupplierIcon,
  FileIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import NewPurchaseOrderModal from '../pharmacy/NewPurchaseOrderModal';
import GoodsReceiveModal from './GoodsReceiveModal';
import ViewPurchaseOrderModal from './ViewPurchaseOrderModal';
import { formatDate, formatCurrency, poCode, STATUS_BADGE, STATUS_LABEL, receivedLabel } from './purchaseOrderUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../pharmacy/pharmacy.css';
import './purchaseOrders.css';

const PER_PAGE_OPTIONS = [8, 20, 50, 100];

const RANGE_LABEL: Record<PoRange, string> = { month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time' };

const toCsv = (rows: PurchaseOrder[]) => {
  const header = ['PO Number', 'Supplier', 'Order Date', 'Expected Date', 'Total Amount', 'Received %', 'Status'];
  const body = rows.map((po) => [
    poCode(po.po_id, po.order_date),
    po.supplier.name,
    formatDate(po.order_date),
    po.expected_date ? formatDate(po.expected_date) : '',
    po.totalAmount.toFixed(2),
    String(po.receivedPct),
    STATUS_LABEL[po.status],
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

const RowMenu = ({
  po,
  onSubmit,
  onReceive,
  onClose,
  onCancel,
}: {
  po: PurchaseOrder;
  onSubmit: () => void;
  onReceive: () => void;
  onClose: () => void;
  onCancel: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  const actions: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (po.status === 'Draft') actions.push({ label: 'Submit to Supplier', onClick: onSubmit });
  if (po.status === 'Submitted' || po.status === 'PartiallyReceived') actions.push({ label: 'Receive Goods', onClick: onReceive });
  if (po.status === 'Received') actions.push({ label: 'Close Order', onClick: onClose });
  if (po.status === 'Draft' || po.status === 'Submitted') actions.push({ label: 'Cancel Order', onClick: onCancel, danger: true });

  if (actions.length === 0) return <span style={{ width: 30, display: 'inline-block' }} />;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="pat-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="pat-menu">
          {actions.map((a) => (
            <button
              key={a.label}
              className={a.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListPurchaseOrdersParams>({ page: 1, limit: 8 });
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState<PurchaseOrderStatus | 'all'>('all');
  const [range, setRange] = useState<PoRange>('month');
  const [exporting, setExporting] = useState(false);

  const [showNewPO, setShowNewPO] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [viewPoId, setViewPoId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(() => getPurchaseOrderStats(range), [range]);
  const { data: topSuppliers, loading: topLoading, reload: reloadTop } = useApiData(() => getTopSuppliers(range, 5), [range]);
  const { data: result, loading, error, reload } = useApiData(() => listPurchaseOrders(filters), [JSON.stringify(filters)]);
  const { data: suppliers } = useApiData(() => listSuppliers());

  const orders = result?.data ?? [];
  const pagination = result?.pagination;

  const refreshAll = () => {
    reload();
    reloadStats();
    reloadTop();
  };

  const setStatusFilter = (value: PurchaseOrderStatus | 'all') => {
    setStatus(value);
    setFilters((f) => ({ ...f, status: value === 'all' ? undefined : value, page: 1 }));
  };

  const setSupplierFilter = (value: string) => {
    setSupplierId(value);
    setFilters((f) => ({ ...f, supplierId: value ? Number(value) : undefined, page: 1 }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setSupplierId('');
    setStatus('all');
    setFilters({ page: 1, limit: filters.limit });
  };

  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleSubmitOrder = async (poId: number) => {
    await submitPurchaseOrder(poId);
    refreshAll();
  };
  const handleCloseOrder = async (poId: number) => {
    await closePurchaseOrder(poId);
    refreshAll();
  };
  const handleCancelOrder = async (poId: number) => {
    await cancelPurchaseOrder(poId);
    refreshAll();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await listPurchaseOrders({ ...filters, page: 1, limit: 1000 });
      const csv = toCsv(all.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
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

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Purchase Orders</h1>
          <p>Home &gt; Purchase Orders</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export Report'}
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewPO(true)}>
            <PlusIcon /> New Purchase Order
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load purchase orders: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<PurchaseOrderIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Orders"
          value={String(stats?.totalOrders ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('all')}>
              View all orders
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Completed"
          value={String(stats?.completed ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.completed / Math.max(stats.totalOrders, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Pending"
          value={String(stats?.pending ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Submitted')}>
              View pending
            </span>
          }
        />
        <KpiCard
          icon={<TruckIcon />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          label="Partially Received"
          value={String(stats?.partiallyReceived ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('PartiallyReceived')}>
              View partially received
            </span>
          }
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Cancelled"
          value={String(stats?.cancelled ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Cancelled')}>
              View cancelled
            </span>
          }
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by PO number, supplier, medicine…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={supplierId} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="">All Suppliers</option>
          {(suppliers ?? []).map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="pat-select" value={status} onChange={(e) => setStatusFilter(e.target.value as PurchaseOrderStatus | 'all')}>
          <option value="all">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Pending</option>
          <option value="PartiallyReceived">Partially Received</option>
          <option value="Received">Completed</option>
          <option value="Closed">Closed</option>
          <option value="Cancelled">Cancelled</option>
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
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Expected Date</th>
                  <th>Total Amount</th>
                  <th>Received</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}

                {!loading && orders.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="pat-empty">No purchase orders match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  orders.map((po) => (
                    <tr key={po.po_id}>
                      <td>
                        <button className="pat-id-link" onClick={() => setViewPoId(po.po_id)}>
                          {poCode(po.po_id, po.order_date)}
                        </button>
                      </td>
                      <td>
                        <div className="pat-name">{po.supplier.name}</div>
                        <div className="pat-muted" style={{ fontSize: 11.5 }}>
                          {po.supplier.contact || ''}
                        </div>
                      </td>
                      <td>{formatDate(po.order_date)}</td>
                      <td>{po.expected_date ? formatDate(po.expected_date) : <span className="pat-muted">—</span>}</td>
                      <td>{formatCurrency(po.totalAmount)}</td>
                      <td style={{ minWidth: 110 }}>
                        <div className="po-received-label">
                          {receivedLabel(po.status, po.receivedPct)}
                          <span className="pat-muted">{po.receivedPct}%</span>
                        </div>
                        <div className="po-progress">
                          <div
                            className={`po-progress-bar${po.status === 'Cancelled' ? ' cancelled' : ''}`}
                            style={{ width: `${Math.min(po.receivedPct, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[po.status]}`}>{STATUS_LABEL[po.status]}</span>
                      </td>
                      <td>
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" onClick={() => setViewPoId(po.po_id)} aria-label="View">
                            <EyeIcon />
                          </button>
                          <RowMenu
                            po={po}
                            onSubmit={() => handleSubmitOrder(po.po_id)}
                            onReceive={() => {
                              setReceivePo(po);
                              setShowReceive(true);
                            }}
                            onClose={() => handleCloseOrder(po.po_id)}
                            onCancel={() => handleCancelOrder(po.po_id)}
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
                {pagination.total} orders
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
              <h3 className="card-title">Order Summary</h3>
              <select className="pat-select" style={{ padding: '6px 10px', fontSize: 12.5 }} value={range} onChange={(e) => setRange(e.target.value as PoRange)}>
                {(Object.keys(RANGE_LABEL) as PoRange[]).map((r) => (
                  <option key={r} value={r}>
                    {RANGE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            {statsLoading && <div className="card-empty">Loading…</div>}
            {stats && (
              <div className="po-summary-list">
                <div className="po-summary-row">
                  <div className="po-summary-icon blue">
                    <PurchaseOrderIcon />
                  </div>
                  <div>
                    <div className="pat-muted">Total Orders</div>
                    <div className="po-summary-value">{stats.totalOrders}</div>
                  </div>
                </div>
                <div className="po-summary-row">
                  <div className="po-summary-icon green">
                    <FileIcon />
                  </div>
                  <div>
                    <div className="pat-muted">Total Amount</div>
                    <div className="po-summary-value">{formatCurrency(stats.totalAmount)}</div>
                  </div>
                </div>
                <div className="po-summary-row">
                  <div className="po-summary-icon purple">
                    <CheckCircleIcon />
                  </div>
                  <div>
                    <div className="pat-muted">Received Amount</div>
                    <div className="po-summary-value">{formatCurrency(stats.receivedAmount)}</div>
                  </div>
                </div>
                <div className="po-summary-row">
                  <div className="po-summary-icon amber">
                    <ClockIcon />
                  </div>
                  <div>
                    <div className="pat-muted">Pending Amount</div>
                    <div className="po-summary-value">{formatCurrency(stats.pendingAmount)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Top Suppliers</h3>
            </div>
            {topLoading && <div className="card-empty">Loading…</div>}
            {!topLoading && (topSuppliers?.length ?? 0) === 0 && <div className="card-empty">No orders in this range yet.</div>}
            {topSuppliers?.map((s) => (
              <div className="apt-schedule-row" key={s.supplierId}>
                <div>
                  <div className="pat-name">{s.supplierName}</div>
                  <div className="pat-muted">{s.orderCount} Orders</div>
                </div>
                <span className="pat-name">{formatCurrency(s.totalAmount)}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowNewPO(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">New Purchase Order</span>
              </button>
              <button
                className="qa-btn"
                onClick={() => {
                  setReceivePo(null);
                  setShowReceive(true);
                }}
              >
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <TruckIcon />
                </div>
                <span className="qa-label">Goods Receive</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/suppliers')}>
                <div className="qa-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <SupplierIcon />
                </div>
                <span className="qa-label">Suppliers</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/reports')}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <FileIcon />
                </div>
                <span className="qa-label">Purchase Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewPO && (
        <NewPurchaseOrderModal
          onClose={() => setShowNewPO(false)}
          onSuccess={() => {
            setShowNewPO(false);
            refreshAll();
          }}
        />
      )}

      {showReceive && (
        <GoodsReceiveModal
          po={receivePo}
          onClose={() => {
            setShowReceive(false);
            setReceivePo(null);
          }}
          onSuccess={() => {
            setShowReceive(false);
            setReceivePo(null);
            refreshAll();
          }}
        />
      )}

      {viewPoId !== null && <ViewPurchaseOrderModal poId={viewPoId} onClose={() => setViewPoId(null)} />}
    </div>
  );
};

export default PurchaseOrders;
