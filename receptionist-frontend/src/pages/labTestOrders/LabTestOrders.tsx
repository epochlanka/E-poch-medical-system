import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listLabTestOrders, printLabTestOrder } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import { ClipboardIcon, CheckCircleIcon, ClockIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon, PrintIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import ReportReceivedModal from './ReportReceivedModal';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';

const PER_PAGE_OPTIONS = [8, 20, 50, 100];

const STATUS_BADGE: Record<LabTestOrder['status'], string> = {
  Pending: 'badge-blue',
  'Report Received': 'badge-amber',
  Completed: 'badge-green',
  Cancelled: 'badge-red',
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const LabTestOrders = () => {
  const [status, setStatus] = useState<LabTestOrder['status'] | 'all'>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [receiveOrder, setReceiveOrder] = useState<LabTestOrder | null>(null);

  const { data: result, loading, error, reload } = useApiData(
    () => listLabTestOrders({ status: status === 'all' ? undefined : status, page, limit }),
    [status, page, limit]
  );
  const { data: pendingCount, reload: reloadPendingCount } = useApiData(() => listLabTestOrders({ status: 'Pending', page: 1, limit: 1 }).then((r) => r.pagination.total));
  const { data: receivedCount, reload: reloadReceivedCount } = useApiData(() =>
    listLabTestOrders({ status: 'Report Received', page: 1, limit: 1 }).then((r) => r.pagination.total)
  );
  const { data: completedCount, reload: reloadCompletedCount } = useApiData(() => listLabTestOrders({ status: 'Completed', page: 1, limit: 1 }).then((r) => r.pagination.total));
  const { data: cancelledCount, reload: reloadCancelledCount } = useApiData(() => listLabTestOrders({ status: 'Cancelled', page: 1, limit: 1 }).then((r) => r.pagination.total));

  const refreshAll = () => {
    reload();
    reloadPendingCount();
    reloadReceivedCount();
    reloadCompletedCount();
    reloadCancelledCount();
  };

  const orders = result?.data ?? [];
  const pagination = result?.pagination;
  const totalOrders = (pendingCount ?? 0) + (receivedCount ?? 0) + (completedCount ?? 0) + (cancelledCount ?? 0);

  const setStatusFilter = (value: LabTestOrder['status'] | 'all') => {
    setStatus(value);
    setPage(1);
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page: p, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, p, p - 1, p + 1]);
    return Array.from(pages)
      .filter((x) => x >= 1 && x <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Lab Test Orders</h1>
          <p>Home &gt; Lab Test Orders</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={refreshAll}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load lab test orders: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<ClipboardIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Orders"
          value={String(totalOrders)}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('all')}>
              View all orders
            </span>
          }
        />
        <KpiCard
          icon={<ClockIcon />}
          iconBg="#dbeafe"
          iconColor="#2563eb"
          label="Pending"
          value={String(pendingCount ?? 0)}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Pending')}>
              View pending
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Report Received"
          value={String(receivedCount ?? 0)}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Report Received')}>
              View awaiting doctor
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Completed"
          value={String(completedCount ?? 0)}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Completed')}>
              View completed
            </span>
          }
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Cancelled"
          value={String(cancelledCount ?? 0)}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Cancelled')}>
              View cancelled
            </span>
          }
        />
      </div>

      <div className="pat-filter-bar">
        <select className="pat-select" value={status} onChange={(e) => setStatusFilter(e.target.value as LabTestOrder['status'] | 'all')}>
          <option value="all">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Report Received">Report Received</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Test</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Ordered At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="pat-empty">No lab test orders match these filters.</div>
                  </td>
                </tr>
              )}

              {!loading &&
                orders.map((o) => (
                  <tr key={o.lab_test_order_id}>
                    <td>{o.request_number}</td>
                    <td>
                      <div className="pat-name">{o.patient?.full_name}</div>
                      <div className="pat-muted" style={{ fontSize: 11.5 }}>
                        {o.patient_id}
                      </div>
                    </td>
                    <td>Dr. {o.doctor?.username}</td>
                    <td>{o.test_name}</td>
                    <td>{o.test_category || '—'}</td>
                    <td>{o.priority}</td>
                    <td>{formatDateTime(o.order_date)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="pat-icon-btn" onClick={() => printLabTestOrder(o.lab_test_order_id)} aria-label="Print request">
                          <PrintIcon />
                        </button>
                        {o.status === 'Pending' && (
                          <button className="pat-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setReceiveOrder(o)}>
                            Report Received
                          </button>
                        )}
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
              Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
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

      {receiveOrder && (
        <ReportReceivedModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onSaved={() => {
            setReceiveOrder(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default LabTestOrders;
