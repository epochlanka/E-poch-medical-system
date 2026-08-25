import { useState } from 'react';
import { skipAppointment, displayPatientName } from '../../lib/queue';
import type { QueueAppointment } from '../../lib/queue';
import { XIcon } from '../../components/layout/Icons';

interface SkipModalProps {
  appointment: QueueAppointment;
  onClose: () => void;
  onSkipped: () => void;
}

const COMMON_REASONS = ['Not responding when called', 'Stepped out / not in waiting area', 'Requested to be seen later'];

const SkipModal = ({ appointment, onClose, onSkipped }: SkipModalProps) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('A reason is required to skip a patient.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await skipAppointment(appointment.appointment_id, reason.trim());
      onSkipped();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to skip patient.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Skip Patient</h2>
            <p className="modal-subtitle">
              {displayPatientName(appointment)} will re-enter the queue later — this doesn't cancel their visit.
            </p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-field span-2">
          <label>Reason *</label>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this patient being skipped?" />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {COMMON_REASONS.map((r) => (
            <button key={r} type="button" className="pat-btn" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Skipping…' : 'Skip Patient'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkipModal;
