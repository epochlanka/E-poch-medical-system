import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getClinicSettings } from '../../lib/settings';
import { listPayments, getPaymentsStats } from '../../lib/billing';
import type { ListPaymentsParams, PaymentRow, Invoice } from '../../lib/billing';
import {
  PlusIcon,
  DownloadIcon,
  SearchIcon,
  CalendarIcon,
  DollarIcon,
  InvoiceIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreVerticalIcon,
  EyeIcon,
  XCircleIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import { formatDateTime, formatCurrency, invoiceCode, paymentStatusLabel, STATUS_BADGE } from './billingUtils';
import ViewInvoiceModal from './ViewInvoiceModal';
import RecordPaymentEntryModal from './RecordPaymentEntryModal';
import RecordPaymentModal from './RecordPaymentModal';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import '../appointments/bookAppointment.css';
import './consolidatedInvoice.css';
import './payments.css';

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const toCsv = (rows: PaymentRow[]) => {
  const header = ['Date & Time', 'Invoice No.', 'Patient', 'Patient ID', 'Method', 'Amount', 'Discount', 'Amount Received', 'Status', 'Received By'];
  const body = rows.map((r) => [
    formatDateTime(r.receivedAt),
    invoiceCode(r.invoiceId, r.invoiceCreatedAt),
    r.patientName,
    r.patientId,
    r.method,
    r.invoiceSubtotal.toFixed(2),
    r.invoiceDiscount.toFixed(2),
    r.amount.toFixed(2),
    paymentStatusLabel(r.invoiceStatus),
    r.receivedBy,
  ]);
  return [header, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
};

const delta = (current: number, prior: number): number | null => (prior <= 0 ? null : ((current - prior) / prior) * 100);

const Payments = () => {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(7));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);

  const { data: clinic } = useApiData(() => getClinicSettings(), []);
  const { data: stats, reload: reloadStats } = useApiData(() => getPaymentsStats(), []);

  const params: ListPaymentsParams = useMemo(
    () => ({
      from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      to: dateTo ? new Date(new Date(dateTo).setHours(23, 59, 59, 999)).toISOString() : undefined,
      method: (method || undefined) as ListPaymentsParams['method'],
      invoiceStatus: (status || undefined) as ListPaymentsParams['invoiceStatus'],
      search: searchInput.trim() || undefined,
      page,
      limit,
    }),
    [dateFrom, dateTo, method, status, searchInput, page, limit]
  );

  const { data: result, loading, reload: reloadPayments } = useApiData(() => listPayments(params), [params]);
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

  const reloadAll = () => {
    reloadStats();
    reloadPayments();
  };

  const handleExport = async () => {
    const all = await listPayments({ ...params, page: 1, limit: 1000 });
    const blob = new Blob([toCsv(all.data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <InvoiceIcon />
            </span>
            Payments
          </h1>
          <p>View, search and manage all payments received.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn primary" onClick={() => setShowEntryModal(true)}>
            <PlusIcon /> Record Payment
          </button>
          <button className="pat-btn" onClick={handleExport}>
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

      <div className="pay-kpi-row">
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
          label="Today's Collections"
          value={stats ? formatCurrency(stats.today.total) : '—'}
          changePct={stats ? delta(stats.today.total, stats.yesterdayTotal) : undefined}
          compareLabel="yesterday"
          footer={stats ? <div className="pay-kpi-sub">{stats.today.count} Payments</div> : undefined}
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="This Week"
          value={stats ? formatCurrency(stats.thisWeek.total) : '—'}
          changePct={stats ? delta(stats.thisWeek.total, stats.lastWeekTotal) : undefined}
          compareLabel="last week"
          footer={stats ? <div className="pay-kpi-sub">{stats.thisWeek.count} Payments</div> : undefined}
        />
        <KpiCard
          icon={<InvoiceIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="This Month"
          value={stats ? formatCurrency(stats.thisMonth.total) : '—'}
          changePct={stats ? delta(stats.thisMonth.total, stats.lastMonthTotal) : undefined}
          compareLabel="last month"
          footer={stats ? <div className="pay-kpi-sub">{stats.thisMonth.count} Payments</div> : undefined}
        />
        <KpiCard
          icon={<SearchIcon />}
          iconBg="#ede9fe"
          iconColor="#6d28d9"
          label="Outstanding Amount"
          value={stats ? formatCurrency(stats.outstandingAmount) : '—'}
          footer={stats ? <div className="pay-kpi-sub">{stats.outstandingInvoices} Invoices</div> : undefined}
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#b91c1c"
          label="Voided Invoices"
          value={stats ? String(stats.voidedInvoices) : '—'}
          footer={<div className="pay-kpi-sub">All time</div>}
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pay-filter-row" style={{ flex: 1 }}>
          <div className="modal-field">
            <label>Date Range</label>
            <div className="pay-date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="modal-field">
            <label>Branch / Location</label>
            <input value={clinic?.clinic_name ?? 'Loading…'} disabled style={{ width: 160 }} />
          </div>
          <div className="modal-field">
            <label>Payment Method</label>
            <select
              className="pat-select"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile">Mobile</option>
            </select>
          </div>
          <div className="modal-field">
            <label>Status</label>
            <select
              className="pat-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="Outstanding">Unpaid</option>
              <option value="PartiallyPaid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Voided">Voided</option>
            </select>
          </div>
        </div>
        <div className="pat-search" style={{ maxWidth: 260 }}>
          <SearchIcon />
          <input
            placeholder="Search by patient name, invoice no. or ID…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="pat-table-card" style={{ marginTop: 16 }}>
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Payment Date &amp; Time</th>
                <th>Invoice No.</th>
                <th>Patient</th>
                <th>Payment Method</th>
                <th>Amount (LKR)</th>
                <th>Discount (LKR)</th>
                <th>Amount Received (LKR)</th>
                <th>Status</th>
                <th>Received By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="pat-empty">
                    No payments found for these filters.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.paymentId}>
                  <td>{(pagination ? (pagination.page - 1) * pagination.limit : 0) + i + 1}</td>
                  <td>{formatDateTime(r.receivedAt)}</td>
                  <td>
                    <button className="pat-id-link" onClick={() => setViewInvoiceId(r.invoiceId)}>
                      {invoiceCode(r.invoiceId, r.invoiceCreatedAt)}
                    </button>
                  </td>
                  <td>
                    <div className="pat-name">{r.patientName}</div>
                    <span className="pat-muted" style={{ fontSize: 11.5 }}>
                      {r.patientId}
                    </span>
                  </td>
                  <td>{r.method}</td>
                  <td className="pay-amount">{r.invoiceSubtotal.toFixed(2)}</td>
                  <td className="pay-discount">{r.invoiceDiscount > 0 ? r.invoiceDiscount.toFixed(2) : '—'}</td>
                  <td className="pay-received">{r.amount.toFixed(2)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[paymentStatusLabel(r.invoiceStatus)]}`}>{paymentStatusLabel(r.invoiceStatus)}</span>
                  </td>
                  <td>{r.receivedBy}</td>
                  <td>
                    <div className="pat-actions-cell">
                      <button className="pat-icon-btn" onClick={() => setOpenMenuId(openMenuId === r.paymentId ? null : r.paymentId)}>
                        <MoreVerticalIcon />
                        {openMenuId === r.paymentId && (
                          <div className="pat-menu" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                setViewInvoiceId(r.invoiceId);
                              }}
                            >
                              <EyeIcon /> View Invoice
                            </button>
                          </div>
                        )}
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
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} payments
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
          </div>
        )}
      </div>

      {viewInvoiceId && (
        <ViewInvoiceModal
          invoiceId={viewInvoiceId}
          onClose={() => setViewInvoiceId(null)}
          onRecordPayment={(inv) => {
            setViewInvoiceId(null);
            setPaymentTarget(inv);
          }}
        />
      )}
      {showEntryModal && (
        <RecordPaymentEntryModal
          onClose={() => setShowEntryModal(false)}
          onSelectInvoice={(inv) => {
            setShowEntryModal(false);
            setPaymentTarget(inv);
          }}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null);
            reloadAll();
          }}
        />
      )}
    </div>
  );
};

export default Payments;
