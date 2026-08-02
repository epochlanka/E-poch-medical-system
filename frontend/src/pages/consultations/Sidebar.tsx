import { AlertIcon, StarIcon, PillIcon, ClockIcon } from '../../components/layout/Icons';
import type { ConsultationContext } from '../../lib/consultations';
import { formatDate, formatTime } from './consultationUtils';

interface SidebarProps {
  context: ConsultationContext;
}

const Sidebar = ({ context }: SidebarProps) => {
  const { patientSummary, recentConsultations, consultation, appointment } = context;

  const timelineSteps = [
    { label: 'Appointment Scheduled', time: appointment.scheduledAt, done: true },
    { label: 'Consultation Started', time: consultation?.created_at ?? null, done: !!consultation },
    { label: 'Prescription', time: consultation?.prescriptions[0]?.issued_at ?? null, done: (consultation?.prescriptions.length ?? 0) > 0, pendingLabel: 'Pending' },
    { label: 'Billing', time: consultation?.invoices[0]?.created_at ?? null, done: (consultation?.invoices.length ?? 0) > 0, pendingLabel: 'Pending' },
    { label: 'Consultation Finalized', time: consultation?.finalized_at ?? null, done: !!consultation?.finalized_at },
  ];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Patient Summary</h3>
        </div>
        <div className="cons-side-item">
          <span className="cons-side-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <AlertIcon />
          </span>
          <div>
            <div className="cons-side-label">Blood Group</div>
            <div className="cons-side-value">{patientSummary.bloodGroup || '—'}</div>
          </div>
        </div>
        <div className="cons-side-item">
          <span className="cons-side-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
            <AlertIcon />
          </span>
          <div>
            <div className="cons-side-label">Allergies</div>
            <div className="cons-side-value">{patientSummary.allergies || 'None recorded'}</div>
          </div>
        </div>
        <div className="cons-side-item">
          <span className="cons-side-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>
            <StarIcon />
          </span>
          <div>
            <div className="cons-side-label">Chronic Conditions</div>
            <div className="cons-side-value">{patientSummary.chronicConditions.join(', ') || 'None recorded'}</div>
          </div>
        </div>
        <div className="cons-side-item">
          <span className="cons-side-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            <PillIcon />
          </span>
          <div>
            <div className="cons-side-label">Current Medications</div>
            <div className="cons-side-value">{patientSummary.currentMedications.join(', ') || 'None recorded'}</div>
          </div>
        </div>
        <div className="cons-side-item">
          <span className="cons-side-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
            <ClockIcon />
          </span>
          <div>
            <div className="cons-side-label">Last Visit</div>
            <div className="cons-side-value">{patientSummary.lastVisit ? formatDate(patientSummary.lastVisit) : 'First visit'}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Visit Timeline</h3>
        </div>
        <div className="cons-timeline">
          {timelineSteps.map((step, i) => (
            <div className="cons-timeline-item" key={i}>
              <span className={`cons-timeline-dot${step.done ? ' done' : ''}`} />
              {step.time && <div className="cons-timeline-time">{formatTime(step.time)}</div>}
              <div className="cons-timeline-label">{step.label}</div>
              <div className="cons-timeline-sub">{step.time ? formatDate(step.time) : step.done ? '' : (step as any).pendingLabel ?? '--:--'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Consultations</h3>
        </div>
        {recentConsultations.length === 0 && <div className="card-empty">No past consultations.</div>}
        {recentConsultations.map((c, i) => (
          <div className="cons-recent-row" key={i}>
            <span className="cons-recent-diagnosis">{c.diagnosis || 'No diagnosis recorded'}</span>
            <span className="cons-recent-date">{formatDate(c.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
