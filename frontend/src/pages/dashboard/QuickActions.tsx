import { useState } from 'react';
import {
  PatientsIcon,
  CalendarIcon,
  PrescriptionIcon,
  MedicineIcon,
  InvoiceIcon,
  PurchaseOrderIcon,
} from '../../components/layout/Icons';
import NewPatientModal from './NewPatientModal';

const ACTIONS = [
  { key: 'patient', label: 'New Patient', icon: PatientsIcon, bg: '#eaf1fe', color: '#2563eb', enabled: true },
  { key: 'appointment', label: 'New Appointment', icon: CalendarIcon, bg: '#dcfce7', color: '#16a34a', enabled: false },
  { key: 'prescription', label: 'New Prescription', icon: PrescriptionIcon, bg: '#f3e8ff', color: '#7c3aed', enabled: false },
  { key: 'medicine', label: 'Add Medicine', icon: MedicineIcon, bg: '#fee2e2', color: '#dc2626', enabled: false },
  { key: 'invoice', label: 'Create Invoice', icon: InvoiceIcon, bg: '#dbeafe', color: '#1d4ed8', enabled: false },
  { key: 'po', label: 'Purchase Order', icon: PurchaseOrderIcon, bg: '#fef3c7', color: '#b45309', enabled: false },
];

const QuickActions = () => {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Quick Actions</h3>
      </div>

      <div className="qa-grid">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            className="qa-btn"
            disabled={!a.enabled}
            onClick={() => a.enabled && setModal(a.key)}
            title={a.enabled ? a.label : `${a.label} — coming soon`}
          >
            {!a.enabled && <span className="qa-soon">SOON</span>}
            <span className="qa-icon" style={{ background: a.bg, color: a.color }}>
              <a.icon />
            </span>
            <span className="qa-label">{a.label}</span>
          </button>
        ))}
      </div>

      {modal === 'patient' && <NewPatientModal onClose={() => setModal(null)} />}
    </div>
  );
};

export default QuickActions;
