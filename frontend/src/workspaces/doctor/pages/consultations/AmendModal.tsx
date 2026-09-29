import { useState } from 'react';
import { amendConsultation, AMENDABLE_FIELDS } from '../../lib/consultations';
import type { AmendableField } from '../../lib/consultations';
import { XIcon } from '../../components/layout/Icons';

interface AmendModalProps {
  consultationId: number;
  currentValues: Record<AmendableField, string>;
  onClose: () => void;
  onAmended: () => void;
}

const AmendModal = ({ consultationId, currentValues, onClose, onAmended }: AmendModalProps) => {
  const [field, setField] = useState<AmendableField>('diagnosis');
  const [newValue, setNewValue] = useState(currentValues.diagnosis ?? '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDate = field === 'follow_up_date';
  const label = AMENDABLE_FIELDS.find((f) => f.field === field)?.label ?? field;

  const handleFieldChange = (next: AmendableField) => {
    setField(next);
    setNewValue(currentValues[next] ?? '');
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('A reason is required to amend a finalized record.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await amendConsultation(consultationId, field, newValue.trim() || null, reason.trim());
      onAmended();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to amend consultation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Amend Finalized Record</h2>
            <p className="modal-subtitle">This consultation is finalized — every change here is logged with your reason and cannot be undone silently.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-field span-2">
          <label>Field to amend</label>
          <select value={field} onChange={(e) => handleFieldChange(e.target.value as AmendableField)}>
            {AMENDABLE_FIELDS.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-field span-2">
          <label>Current value</label>
          <input value={currentValues[field] || '—'} disabled />
        </div>

        <div className="modal-field span-2">
          <label>New value</label>
          {isDate ? (
            <input type="date" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          ) : (
            <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={`Corrected ${label.toLowerCase()}`} />
          )}
        </div>

        <div className="modal-field span-2">
          <label>Reason for amendment *</label>
          <input autoFocus={false} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Lab result came back different" />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save Amendment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmendModal;
