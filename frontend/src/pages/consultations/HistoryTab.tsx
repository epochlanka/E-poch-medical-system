import type { ReactNode } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getPatientHistory } from '../../lib/patients';
import { CalendarIcon, StethoscopeIcon, PrescriptionIcon, InvoiceIcon } from '../../components/layout/Icons';
import { formatDateTime } from './consultationUtils';

const ICONS: Record<string, ReactNode> = {
  appointment: <CalendarIcon />,
  consultation: <StethoscopeIcon />,
  prescription: <PrescriptionIcon />,
  invoice: <InvoiceIcon />,
};

const summarize = (event: any): string => {
  switch (event.type) {
    case 'appointment':
      return `Appointment with Dr. ${event.doctorName} — ${event.status}`;
    case 'consultation':
      return event.diagnosis ? `Consultation — ${event.diagnosis}` : `Consultation — ${event.status}`;
    case 'prescription':
      return `Prescription (${event.items.length} item${event.items.length === 1 ? '' : 's'}) — ${event.status}`;
    case 'invoice':
      return `Invoice — ${event.paymentStatus} (${event.totalAmount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })})`;
    default:
      return '';
  }
};

interface HistoryTabProps {
  patientId: string;
}

const HistoryTab = ({ patientId }: HistoryTabProps) => {
  const { data: events, loading, error } = useApiData(() => getPatientHistory(patientId), [patientId]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Full Patient History</h3>
      </div>
      {loading && <p className="card-subtitle">Loading…</p>}
      {error && <div className="dash-error-banner">{error}</div>}
      {!loading && events?.length === 0 && <div className="card-empty">No history recorded yet.</div>}
      {events?.map((event, i) => (
        <div className="appt-row" key={i}>
          <span className="rx-icon">{ICONS[event.type]}</span>
          <div className="appt-info">
            <div className="appt-name">{summarize(event)}</div>
            <div className="appt-mrn">{formatDateTime(event.date)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryTab;
