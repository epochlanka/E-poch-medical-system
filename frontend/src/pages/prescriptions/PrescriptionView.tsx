import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getPrescription, downloadPrescriptionPdf } from '../../lib/prescriptions';
import { PrintIcon, ChevronLeftIcon, DownloadIcon } from '../../components/layout/Icons';
import { formatDateTime } from '../consultations/consultationUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../consultations/consultation.css';
import './prescriptions.css';

const STATUS_BADGE: Record<string, string> = {
  Pending: 'badge-amber',
  Preparing: 'badge-blue',
  Dispensed: 'badge-purple',
  Collected: 'badge-green',
};

const PrescriptionView = () => {
  const { prescriptionId } = useParams();
  const navigate = useNavigate();
  const id = Number(prescriptionId);

  const { data: rx, loading, error } = useApiData(() => getPrescription(id), [id]);

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !rx) return <div className="dash-error-banner">Couldn't load this prescription: {error}</div>;

  const code = `RX${String(rx.prescription_id).padStart(6, '0')}`;

  return (
    <div>
      <div className="cons-header">
        <div>
          <h1>{code}</h1>
          <div className="cons-breadcrumb">
            <button className="pat-id-link" onClick={() => navigate('/prescriptions')} style={{ fontSize: 12.5 }}>
              Prescriptions
            </button>
            <span>›</span>
            <span>{code}</span>
          </div>
        </div>
        <div className="cons-header-actions">
          <button className="cons-btn" onClick={() => navigate(-1)}>
            <ChevronLeftIcon /> Back
          </button>
          <button className="cons-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="cons-btn primary" onClick={() => downloadPrescriptionPdf(rx.prescription_id, code)}>
            <DownloadIcon /> Download PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">{code}</h3>
          <span className={`badge ${STATUS_BADGE[rx.status] ?? 'badge-gray'}`}>{rx.status}</span>
        </div>
        <p className="card-subtitle">
          {rx.is_refill ? 'Refill / Repeat Prescription' : 'New Prescription'} · Issued {formatDateTime(rx.issued_at)}
        </p>
      </div>

      <div className="cons-box">
        <div className="cons-box-title">Medicines</div>
        <table className="rxb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Medicine</th>
              <th>Strength</th>
              <th>Dose</th>
              <th>Frequency</th>
              <th>Duration</th>
              <th>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {rx.items.map((item, i) => (
              <tr key={item.rx_item_id}>
                <td>{i + 1}</td>
                <td>
                  <div className="rxb-med-name">{item.medicine.name}</div>
                  {item.medicine.generic_name && <div className="rxb-med-generic">{item.medicine.generic_name}</div>}
                </td>
                <td>{item.medicine.strength || '—'}</td>
                <td>{item.dosage}</td>
                <td>{item.frequency || '—'}</td>
                <td>{item.duration || '—'}</td>
                <td>{item.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PrescriptionView;
