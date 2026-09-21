import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { listPrescriptions } from '../../lib/prescriptions';
import type { ListPrescriptionsParams } from '../../lib/prescriptions';
import { PrescriptionIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/layout/Icons';
import { formatDateTime } from '../consultations/consultationUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './prescriptions.css';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'badge-amber',
  Preparing: 'badge-blue',
  Dispensed: 'badge-purple',
  Collected: 'badge-green',
};

const PrescriptionsQueue = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ListPrescriptionsParams>({ page: 1, limit: 20 });
  const { data, loading } = useApiData(() => listPrescriptions(filters), [JSON.stringify(filters)]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Prescriptions</h1>
          <p>Every prescription issued, across all patients.</p>
        </div>
      </div>

      <div className="pat-filter-bar">
        <select className="pat-select" value={filters.status ?? ''} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined, page: 1 }))}>
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Preparing">Preparing</option>
          <option value="Dispensed">Dispensed</option>
          <option value="Collected">Collected</option>
        </select>
      </div>

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Patient</th>
                <th>Medicines</th>
                <th>Issued</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="pat-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && data?.data.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="pat-empty">No prescriptions found.</div>
                  </td>
                </tr>
              )}
              {data?.data.map((rx) => (
                <tr key={rx.prescriptionId} style={{ cursor: 'pointer' }} onClick={() => navigate(`/prescriptions/${rx.prescriptionId}`)}>
                  <td>
                    <button className="pat-id-link">{rx.code}</button>
                  </td>
                  <td>
                    <div className="pat-name-cell">
                      <div className="pat-avatar">
                        <PrescriptionIcon />
                      </div>
                      <span className="pat-name">{rx.patientName}</span>
                    </div>
                  </td>
                  <td>{rx.items.map((i) => i.medicine).join(', ')}</td>
                  <td>{formatDateTime(rx.issuedAt)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[rx.status] ?? 'badge-gray'}`}>{rx.status}</span>
                    {rx.isRefill && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Refill</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.pagination.total > 0 && (
          <div className="pat-pagination">
            <div className="pat-pagination-info">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
              {data.pagination.total} prescriptions
            </div>
            <div className="pat-pagination-pages">
              <button className="pat-page-btn" disabled={data.pagination.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>
                <ChevronLeftIcon />
              </button>
              <span className="pat-page-btn active">{data.pagination.page}</span>
              <button
                className="pat-page-btn"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrescriptionsQueue;
