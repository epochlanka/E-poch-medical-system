import { useApiData } from '../../hooks/useApiData';
import { getRecentPrescriptions } from '../../lib/dashboard';
import type { RecentPrescription } from '../../lib/dashboard';
import { PrescriptionIcon } from '../../components/layout/Icons';

const STATUS_BADGE: Record<RecentPrescription['status'], string> = {
  Pending: 'badge-amber',
  Preparing: 'badge-blue',
  Dispensed: 'badge-green',
  Collected: 'badge-gray',
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const RecentPrescriptions = () => {
  const { data, loading, error } = useApiData(() => getRecentPrescriptions(5));

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Recent Prescriptions</h3>
      </div>

      {loading && <div className="card-empty">Loading…</div>}
      {error && <div className="card-empty">{error}</div>}
      {!loading && !error && !data?.length && <div className="card-empty">No prescriptions yet.</div>}

      {data?.map((rx) => (
        <div className="rx-row" key={rx.prescriptionId}>
          <div className="rx-icon">
            <PrescriptionIcon />
          </div>
          <div className="rx-info">
            <div className="rx-code">{rx.code}</div>
            <div className="rx-name">{rx.patientName}</div>
            <div className="rx-time">{formatDateTime(rx.issuedAt)}</div>
          </div>
          <span className={`badge ${STATUS_BADGE[rx.status]}`}>{rx.status}</span>
        </div>
      ))}
    </div>
  );
};

export default RecentPrescriptions;
