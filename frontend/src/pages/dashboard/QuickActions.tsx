import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { listMasterData } from '../../lib/settings';
import {
  PatientsIcon,
  CalendarIcon,
  PrescriptionIcon,
  MedicineIcon,
  InvoiceIcon,
  PurchaseOrderIcon,
} from '../../components/layout/Icons';
import NewPatientModal from './NewPatientModal';
import NewAppointmentModal from '../appointments/NewAppointmentModal';
import MedicineFormModal from '../pharmacy/MedicineFormModal';
import NewInvoiceModal from '../invoices/NewInvoiceModal';
import NewPurchaseOrderModal from '../pharmacy/NewPurchaseOrderModal';

// 'prescription' has no blank-create flow anywhere in the app — a prescription only ever comes
// from within a specific consultation's workspace — so its action navigates to the Consultations
// queue (the real starting point) instead of pretending there's a standalone creation form.
const ACTIONS = [
  { key: 'patient', label: 'New Patient', icon: PatientsIcon, bg: '#eaf1fe', color: '#2563eb', kind: 'modal' as const },
  { key: 'appointment', label: 'New Appointment', icon: CalendarIcon, bg: '#dcfce7', color: '#16a34a', kind: 'modal' as const },
  { key: 'prescription', label: 'New Prescription', icon: PrescriptionIcon, bg: '#f3e8ff', color: '#7c3aed', kind: 'navigate' as const, to: '/consultations' },
  { key: 'medicine', label: 'Add Medicine', icon: MedicineIcon, bg: '#fee2e2', color: '#dc2626', kind: 'modal' as const },
  { key: 'invoice', label: 'Create Invoice', icon: InvoiceIcon, bg: '#dbeafe', color: '#1d4ed8', kind: 'modal' as const },
  { key: 'po', label: 'Purchase Order', icon: PurchaseOrderIcon, bg: '#fef3c7', color: '#b45309', kind: 'modal' as const },
];

const QuickActions = () => {
  const navigate = useNavigate();
  const [modal, setModal] = useState<string | null>(null);
  const { data: categories } = useApiData(() => listMasterData('MedicineCategory'));

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
            onClick={() => (a.kind === 'navigate' ? navigate(a.to) : setModal(a.key))}
            title={a.label}
          >
            <span className="qa-icon" style={{ background: a.bg, color: a.color }}>
              <a.icon />
            </span>
            <span className="qa-label">{a.label}</span>
          </button>
        ))}
      </div>

      {modal === 'patient' && <NewPatientModal onClose={() => setModal(null)} />}

      {modal === 'appointment' && (
        <NewAppointmentModal onClose={() => setModal(null)} onSuccess={() => setModal(null)} />
      )}

      {modal === 'medicine' && (
        <MedicineFormModal categories={(categories ?? []).map((c) => c.value)} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}

      {modal === 'invoice' && <NewInvoiceModal onClose={() => setModal(null)} onSuccess={() => setModal(null)} />}

      {modal === 'po' && <NewPurchaseOrderModal onClose={() => setModal(null)} onSuccess={() => setModal(null)} />}
    </div>
  );
};

export default QuickActions;
