import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { listPayments, getPaymentsStats } from '../../lib/billing';
import type { ListPaymentsParams, PaymentStatus, PaymentsStats } from '../../lib/billing';
import {
  PaymentIcon,
  DollarIcon,
  ClockIcon,
  XCircleIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  DownloadIcon,
  PrintIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InvoiceIcon,
  ClipboardIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import StockOverviewDonut from '../pharmacy/StockOverviewDonut';
import ReceivePaymentModal from '../invoices/ReceivePaymentModal';
import ReconciliationModal from '../invoices/ReconciliationModal';
import ViewInvoiceModal from '../invoices/ViewInvoiceModal';
import PaymentMethodsPanel from './PaymentMethodsPanel';
import { formatCurrency, formatDate, invoiceCode, invoiceStatusLabel, STATUS_BADGE } from '../invoices/invoiceUtils';
import { paymentCode, METHOD_BADGE, INVOICE_STATUS_COLOR, INVOICE_STATUS_LABEL } from './paymentsUtils';
import '../pharmacy/pharmacy.css';
import '../dashboard/dashboard.css';
import '../patients/patients.css';

const PER_PAGE_OPTIONS = [10, 25, 50];

const Payments = () => {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListPaymentsParams>({ page: 1, limit: 10 });
  const [method, setMethod] = useState<'all' | 'Cash' | 'Card' | 'Mobile'>('all');
  const [invoiceStatus, setInvoiceStatus] = useState<'all' | PaymentStatus>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statsRange, setStatsRange] = useState<PaymentsStats['range']>('month');

  const [showReceivePayment, setShowReceivePayment] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: result, loading, error, reload } = useApiData(() => listPayments(filters), [JSON.stringify(filters)]);
  const { data: stats, reload: reloadStats } = useApiData(() => getPaymentsStats(statsRange), [statsRange]);

  const payments = result?.data ?? [];
  const pagination = result?.pagination;

  const refreshAll = () => {
    reload();
    reloadStats();
  };

  const applyFilters = () => {
    setFilters((f) => ({
      ...f,
      method: method === 'all' ? undefined : method,
      invoiceStatus: invoiceStatus === 'all' ? undefined : invoiceStatus,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      page: 1,
    }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setMethod('all');
    setInvoiceStatus('all');
    setFrom('');
    setTo('');
    setFilters({ page: 1, limit: filters.limit });
  };

  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleExport = async () => {
    const all = await listPayments({ ...filters, page: 1, limit: 1000 });
    const header = ['Payment ID', 'Invoice No', 'Patient', 'Date', 'Amount', 'Method', 'Invoice Status', 'Received By'];
    const rows = all.data.map((p) => [
      paymentCode(p.paymentId, p.receivedAt),
      invoiceCode(p.invoiceId, p.invoiceCreatedAt),
      p.patientName,
      formatDate(p.receivedAt),
      p.amount.toFixed(2),
      p.method,
      invoiceStatusLabel(p.invoiceStatus),
      p.receivedBy,
    ]);
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const donutSegments = (stats?.byInvoiceStatus ?? []).map((s) => ({
    label: INVOICE_STATUS_LABEL[s.status] ?? s.status,
    value: s.count,
    color: INVOICE_STATUS_COLOR[s.status] ?? '#94a3b8',
  }));
  const donutTotal = donutSegments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Payments</h1>
          <p>Home &gt; Payments</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport}>
            <DownloadIcon /> Export Report
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn primary" onClick={() => setShowReceivePayment(true)}>
            <PlusIcon /> Receive Payment
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load payments: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<PaymentIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Payments"
          value={String(stats?.totalPayments ?? 0)}
          loading={!stats}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              All time
            </span>
          }
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Total Received"
          value={formatCurrency(stats?.totalReceived ?? 0)}
          loading={!stats}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              All time
            </span>
          }
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Outstanding Invoices"
          value={String(stats?.outstandingInvoices ?? 0)}
          loading={!stats}
          footer={
            <span className="kpi-view-all" style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => navigate('/billing/invoices')}>
              View invoices
            </span>
          }
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Voided Invoices"
          value={String(stats?.voidedInvoices ?? 0)}
          loading={!stats}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              All time
            </span>
          }
        />
        <KpiCard
          icon={<InvoiceIcon />}
          iconBg="#ede9fe"
          iconColor="#6d28d9"
          label="Received This Month"
          value={formatCurrency(stats?.totalReceivedThisMonth ?? 0)}
          loading={!stats}
        />
      </div>

      <div className="ph-layout">
        <div className="pat-table-card">
          <div className="pat-filter-bar">
            <div className="pat-search">
              <SearchIcon />
              <input placeholder="Search by payment ID, invoice no, patient name…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>

            <select className="pat-select" value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="all">All Payment Methods</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile">Mobile</option>
            </select>

            <select className="pat-select" value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as any)}>
              <option value="all">All Invoice Status</option>
              <option value="Outstanding">Outstanding</option>
              <option value="PartiallyPaid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Voided">Voided</option>
            </select>

            <input type="date" className="pat-select" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="pat-select" value={to} onChange={(e) => setTo(e.target.value)} />

            <button className="pat-btn" onClick={applyFilters}>
              <FilterIcon /> Filter
            </button>
            <button className="pat-btn" onClick={resetFilters}>
              <RefreshIcon /> Reset
            </button>
          </div>

          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Payment ID</th>
                  <th>Invoice No</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Invoice Status</th>
                  <th>Received By</th>
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

                {!loading && payments.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <div className="pat-empty">No payments match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  payments.map((p, i) => (
                    <tr key={p.paymentId}>
                      <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 10) + i + 1}</td>
                      <td>
                        <span className="pat-id-link" style={{ cursor: 'default' }}>
                          {paymentCode(p.paymentId, p.receivedAt)}
                        </span>
                      </td>
                      <td>
                        <button className="pat-id-link" onClick={() => setViewInvoiceId(p.invoiceId)}>
                          {invoiceCode(p.invoiceId, p.invoiceCreatedAt)}
                        </button>
                      </td>
                      <td>
                        <div>{p.patientName}</div>
                        <span className="pat-muted" style={{ fontSize: 11.5 }}>
                          {p.patientPhone || '—'}
                        </span>
                      </td>
                      <td>{formatDate(p.receivedAt)}</td>
                      <td style={{ fontWeight: 700 }}>{formatCurrency(p.amount)}</td>
                      <td>
                        <span className={`badge ${METHOD_BADGE[p.method]}`}>{p.method}</span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[invoiceStatusLabel(p.invoiceStatus)]}`}>{invoiceStatusLabel(p.invoiceStatus)}</span>
                      </td>
                      <td>{p.receivedBy}</td>
                      <td>
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" onClick={() => setViewInvoiceId(p.invoiceId)} aria-label="View invoice">
                            <EyeIcon />
                          </button>
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
                {pagination.total} payments
              </div>

              <div className="pat-pagination-pages">
                <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                  <ChevronLeftIcon />
                </button>
                {(() => {
                  const { page, totalPages } = pagination;
                  const pages =
                    totalPages <= 7
                      ? Array.from({ length: totalPages }, (_, i) => i + 1)
                      : Array.from(new Set([1, totalPages, page, page - 1, page + 1])).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
                  return pages.map((p, i) => {
                    const prev = pages[i - 1];
                    const showEllipsis = prev !== undefined && p - prev > 1;
                    return (
                      <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                        <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => goToPage(p)}>
                          {p}
                        </button>
                      </span>
                    );
                  });
                })()}
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
              <h3 className="card-title">Invoice Status Overview</h3>
            </div>
            {!stats && <div className="card-empty">Loading…</div>}
            {stats && donutSegments.length > 0 && <StockOverviewDonut segments={donutSegments} total={donutTotal} />}
          </div>

          <PaymentMethodsPanel stats={stats ?? null} range={statsRange} onRangeChange={setStatsRange} />

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowReceivePayment(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">Receive Payment</span>
              </button>
              <button className="qa-btn" onClick={() => setShowReconciliation(true)}>
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <DollarIcon />
                </div>
                <span className="qa-label">Cash Reconciliation</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/billing/invoices')}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <InvoiceIcon />
                </div>
                <span className="qa-label">View Invoices</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/reports?tab=financial')}>
                <div className="qa-icon" style={{ background: '#ede9fe', color: '#6d28d9' }}>
                  <ClipboardIcon />
                </div>
                <span className="qa-label">Payment Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

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
          canVoid={false}
          onClose={() => setViewInvoiceId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
};

export default Payments;
