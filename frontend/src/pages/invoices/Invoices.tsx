import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { useAuth } from '../../context/AuthContext';
import { listInvoices, getInvoiceStats, getInvoice } from '../../lib/billing';
import type { Invoice, InvoiceType, ListInvoicesParams, PaymentStatus } from '../../lib/billing';
import {
  InvoiceIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertIcon,
  DollarIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  PrintIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PaymentIcon,
  FileIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import InvoicePreview from './InvoicePreview';
import NewInvoiceModal from './NewInvoiceModal';
import ReceivePaymentModal from './ReceivePaymentModal';
import ViewInvoiceModal from './ViewInvoiceModal';
import ReconciliationModal from './ReconciliationModal';
import { formatCurrency, formatDate, invoiceCode, invoiceStatusLabel, paymentStatusLabel, STATUS_BADGE } from './invoiceUtils';
import { initials } from '../patients/patientUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../pharmacy/pharmacy.css';
import '../appointments/appointments.css';
import './invoices.css';

const PER_PAGE_OPTIONS = [8, 20, 50, 100];

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

const RowMenu = ({ invoice, onReceivePayment }: { invoice: Invoice; onReceivePayment: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const canReceive = invoice.payment_status === 'Outstanding' || invoice.payment_status === 'PartiallyPaid';

  if (!canReceive) return <span style={{ width: 30, display: 'inline-block' }} />;

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
              onReceivePayment();
            }}
          >
            Receive Payment
          </button>
        </div>
      )}
    </div>
  );
};

const Invoices = () => {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListInvoicesParams>({ page: 1, limit: 8 });
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [type, setType] = useState<InvoiceType | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showReceivePayment, setShowReceivePayment] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getInvoiceStats);
  const { data: result, loading, error, reload } = useApiData(() => listInvoices(filters), [JSON.stringify(filters)]);

  const invoices = result?.data ?? [];
  const pagination = result?.pagination;

  useEffect(() => {
    if (!previewInvoiceId && invoices.length > 0) setPreviewInvoiceId(invoices[0].invoice_id);
  }, [invoices, previewInvoiceId]);

  const { data: previewInvoice } = useApiData(() => (previewInvoiceId ? getInvoice(previewInvoiceId) : Promise.resolve(null)), [previewInvoiceId]);

  const refreshAll = () => {
    reload();
    reloadStats();
  };

  const setStatusFilter = (value: PaymentStatus | 'all') => {
    setStatus(value);
    setFilters((f) => ({ ...f, status: value === 'all' ? undefined : value, page: 1 }));
  };
  const setTypeFilter = (value: InvoiceType | 'all') => {
    setType(value);
    setFilters((f) => ({ ...f, type: value === 'all' ? undefined : value, page: 1 }));
  };
  const applyDateRange = () => {
    setFilters((f) => ({
      ...f,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      page: 1,
    }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setStatus('all');
    setType('all');
    setFrom('');
    setTo('');
    setFilters({ page: 1, limit: filters.limit });
  };

  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await listInvoices({ ...filters, page: 1, limit: 1000 });
      const header = ['Invoice No', 'Patient', 'Date', 'Type', 'Total Amount', 'Paid Amount', 'Balance', 'Payment Status'];
      const body = all.data.map((inv) => [
        invoiceCode(inv.invoice_id, inv.created_at),
        inv.patient?.full_name ?? '',
        formatDate(inv.created_at),
        inv.type ?? '',
        inv.total_amount.toFixed(2),
        inv.paid_amount.toFixed(2),
        (inv.total_amount - inv.paid_amount).toFixed(2),
        paymentStatusLabel(inv.payment_status, inv.created_at),
      ]);
      const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const csv = [header, ...body].map((r) => r.map(escape).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <h1>Invoices</h1>
          <p>Home &gt; Invoices</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export Report'}
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewInvoice(true)}>
            <PlusIcon /> New Invoice
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load invoices: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<InvoiceIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Invoices"
          value={String(stats?.totalInvoices ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('all')}>
              View all invoices
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Paid Invoices"
          value={String(stats?.paidInvoices ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.paidInvoices / Math.max(stats.totalInvoices, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Unpaid Invoices"
          value={String(stats?.unpaidInvoices ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.unpaidInvoices / Math.max(stats.totalInvoices, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<AlertIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Overdue Invoices"
          value={String(stats?.overdueInvoices ?? 0)}
          loading={statsLoading}
          footer={
            stats ? (
              <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
                {((stats.overdueInvoices / Math.max(stats.totalInvoices, 1)) * 100).toFixed(1)}% of total
              </span>
            ) : undefined
          }
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#f3e8ff"
          iconColor="#9333ea"
          label="Total Revenue"
          value={formatCurrency(stats?.totalRevenueThisMonth ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>This Month</span>}
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by invoice no, patient name, phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={status} onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | 'all')}>
          <option value="all">All Status</option>
          <option value="Outstanding">Unpaid</option>
          <option value="PartiallyPaid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Voided">Voided</option>
        </select>

        <select className="pat-select" value={type} onChange={(e) => setTypeFilter(e.target.value as InvoiceType | 'all')}>
          <option value="all">All Types</option>
          <option value="Consultation">Consultation</option>
          <option value="Pharmacy">Pharmacy</option>
          <option value="Consultation+Pharmacy">Consultation+Pharmacy</option>
        </select>

        <input type="date" className="pat-select" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="pat-select" value={to} onChange={(e) => setTo(e.target.value)} />

        <button className="pat-btn" onClick={applyDateRange}>
          <FilterIcon /> Filter
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      <div className="ph-layout">
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table inv-clickable-rows">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Invoice No</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Total Amount</th>
                  <th>Paid Amount</th>
                  <th>Balance</th>
                  <th>Payment Status</th>
                  <th>Invoice Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={11} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}

                {!loading && invoices.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <div className="pat-empty">No invoices match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  invoices.map((inv, i) => {
                    const balance = inv.total_amount - inv.paid_amount;
                    const payLabel = paymentStatusLabel(inv.payment_status, inv.created_at);
                    return (
                      <tr key={inv.invoice_id} className={inv.invoice_id === previewInvoiceId ? 'selected' : ''} onClick={() => setPreviewInvoiceId(inv.invoice_id)}>
                        <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 8) + i + 1}</td>
                        <td>
                          <button
                            className="pat-id-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewInvoiceId(inv.invoice_id);
                            }}
                          >
                            {invoiceCode(inv.invoice_id, inv.created_at)}
                          </button>
                        </td>
                        <td>
                          <div className="pat-name-cell">
                            <div className="pat-avatar">{initials(inv.patient?.full_name ?? '?')}</div>
                            <div>
                              <div className="pat-name">{inv.patient?.full_name}</div>
                              <div className="pat-muted" style={{ fontSize: 11.5 }}>
                                {inv.patient?.phone || ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{formatDate(inv.created_at)}</td>
                        <td>{inv.type}</td>
                        <td>{formatCurrency(inv.total_amount)}</td>
                        <td>{formatCurrency(inv.paid_amount)}</td>
                        <td>{formatCurrency(balance)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[payLabel]}`}>{payLabel}</span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[invoiceStatusLabel(inv.payment_status)]}`}>{invoiceStatusLabel(inv.payment_status)}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="pat-actions-cell">
                            <button className="pat-icon-btn" onClick={() => setViewInvoiceId(inv.invoice_id)} aria-label="View">
                              <EyeIcon />
                            </button>
                            <button
                              className="pat-icon-btn"
                              onClick={() => {
                                setPreviewInvoiceId(inv.invoice_id);
                                setTimeout(() => window.print(), 50);
                              }}
                              aria-label="Print"
                            >
                              <PrintIcon />
                            </button>
                            <RowMenu invoice={inv} onReceivePayment={() => setShowReceivePayment(true)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} invoices
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
              <h3 className="card-title">Invoice Preview</h3>
              {previewInvoiceId && (
                <button className="card-link" onClick={() => setViewInvoiceId(previewInvoiceId)}>
                  View Full Invoice
                </button>
              )}
            </div>
            {!previewInvoice && <div className="card-empty">Select an invoice to preview it here.</div>}
            {previewInvoice && <InvoicePreview invoice={previewInvoice} />}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowNewInvoice(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">New Invoice</span>
              </button>
              <button className="qa-btn" onClick={() => setShowReceivePayment(true)}>
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <PaymentIcon />
                </div>
                <span className="qa-label">Receive Payment</span>
              </button>
              {(user?.role === 'Admin' || user?.role === 'Receptionist') && (
                <button className="qa-btn" onClick={() => setShowReconciliation(true)}>
                  <div className="qa-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <FileIcon />
                  </div>
                  <span className="qa-label">Cash Reconciliation</span>
                </button>
              )}
              <button className="qa-btn" onClick={() => previewInvoiceId && setViewInvoiceId(previewInvoiceId)} disabled={!previewInvoiceId}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <DownloadIcon />
                </div>
                <span className="qa-label">Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewInvoice && (
        <NewInvoiceModal
          onClose={() => setShowNewInvoice(false)}
          onSuccess={() => {
            setShowNewInvoice(false);
            refreshAll();
          }}
        />
      )}

      {showReceivePayment && (
        <ReceivePaymentModal
          onClose={() => setShowReceivePayment(false)}
          onSuccess={() => {
            setShowReceivePayment(false);
            refreshAll();
          }}
        />
      )}

      {showReconciliation && <ReconciliationModal onClose={() => setShowReconciliation(false)} />}

      {viewInvoiceId !== null && (
        <ViewInvoiceModal
          invoiceId={viewInvoiceId}
          canVoid={user?.role === 'Admin'}
          onClose={() => setViewInvoiceId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
};

export default Invoices;
