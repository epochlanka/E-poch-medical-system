import { useState } from 'react';
import { fileUrl } from '../../lib/api';
import { dismissDuplicateFlag, mergeDuplicateFlag } from '../../lib/duplicates';
import type { DuplicateFlag, MatchField } from '../../lib/duplicates';
import { initials, calculateAge, formatDate } from './patientUtils';

interface DuplicateFlagModalProps {
  flag: DuplicateFlag;
  mode: 'merge' | 'view';
  onClose: () => void;
  onResolved: () => void;
}

const MATCH_ROWS: { key: 'dob' | 'nic' | 'phone' | 'address'; label: string }[] = [
  { key: 'dob', label: 'Date of Birth' },
  { key: 'nic', label: 'NIC' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
];

const fieldRowClass = (f: MatchField) => (f.status === 'exact' ? 'exact' : f.status === 'similar' ? 'similar' : '');

const PatientCard = ({
  patient,
  label,
  chosen,
  onChoose,
  showChoose,
}: {
  patient: DuplicateFlag['patient'];
  label: string;
  chosen: boolean;
  onChoose: () => void;
  showChoose: boolean;
}) => (
  <div className={`dup-modal-patient${chosen ? ' chosen' : ''}`}>
    <div className="dup-modal-patient-header">
      {patient.photo_url ? (
        <img className="pat-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
      ) : (
        <div className="pat-avatar">{initials(patient.full_name)}</div>
      )}
      <div>
        <div className="pat-name">{patient.full_name}</div>
        <span className="pat-muted" style={{ fontSize: 11.5 }}>
          {patient.patient_id} · {label}
        </span>
      </div>
      {!patient.is_active && <span className="dup-inactive-badge" style={{ marginLeft: 'auto' }}>INACTIVE</span>}
    </div>
    <div className="dup-modal-field">
      <span className="dup-modal-field-label">Date of Birth</span>
      <span className="dup-modal-field-value">
        {formatDate(patient.dob)} ({calculateAge(patient.dob)} yrs)
      </span>
    </div>
    <div className="dup-modal-field">
      <span className="dup-modal-field-label">NIC</span>
      <span className="dup-modal-field-value">{patient.nic || '—'}</span>
    </div>
    <div className="dup-modal-field">
      <span className="dup-modal-field-label">Phone</span>
      <span className="dup-modal-field-value">{patient.phone || '—'}</span>
    </div>
    <div className="dup-modal-field">
      <span className="dup-modal-field-label">Address</span>
      <span className="dup-modal-field-value">{patient.family?.address || '—'}</span>
    </div>
    <div className="dup-modal-field">
      <span className="dup-modal-field-label">Status</span>
      <span className="dup-modal-field-value">{patient.is_active ? 'Active' : 'Inactive'}</span>
    </div>
    {showChoose && (
      <button className={`dup-modal-keep-btn${chosen ? ' chosen' : ''}`} onClick={onChoose}>
        {chosen ? '✓ Keep This Record' : 'Keep This Record'}
      </button>
    )}
  </div>
);

const DuplicateFlagModal = ({ flag, mode, onClose, onResolved }: DuplicateFlagModalProps) => {
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = async () => {
    if (!primaryId) return;
    setSubmitting(true);
    setError(null);
    try {
      await mergeDuplicateFlag(flag.flagId, primaryId);
      onResolved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to merge records.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await dismissDuplicateFlag(flag.flagId);
      onResolved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to dismiss flag.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <h3 className="modal-title">{mode === 'merge' ? 'Review & Merge Duplicate' : 'Duplicate Record Details'}</h3>
        <p className="modal-subtitle">
          {flag.matchScorePct}% match · {flag.matchLabel} · Flagged {formatDate(flag.createdAt)}
        </p>

        <div className="dup-match-summary">
          {MATCH_ROWS.map((row) => {
            const f = flag.breakdown[row.key];
            return (
              <div key={row.key} className={`dup-match-row ${fieldRowClass(f)}`} style={{ marginBottom: 4 }}>
                <span className="dup-match-label">{row.label}:</span>
                <span>{f.detail}</span>
              </div>
            );
          })}
        </div>

        <div className="dup-modal-compare">
          <PatientCard
            patient={flag.patient}
            label="New Record"
            chosen={primaryId === flag.patient.patient_id}
            onChoose={() => setPrimaryId(flag.patient.patient_id)}
            showChoose={mode === 'merge'}
          />
          <div className="dup-modal-vs">VS</div>
          <PatientCard
            patient={flag.matchedPatient}
            label="Existing Record"
            chosen={primaryId === flag.matchedPatient.patient_id}
            onChoose={() => setPrimaryId(flag.matchedPatient.patient_id)}
            showChoose={mode === 'merge'}
          />
        </div>

        {flag.status !== 'Pending' && (
          <p className="pat-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
            This flag was already {flag.status.toLowerCase()} {flag.reviewedBy ? `by ${flag.reviewedBy}` : ''}
            {flag.reviewedAt ? ` on ${formatDate(flag.reviewedAt)}` : ''}.
          </p>
        )}

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={submitting}>
            Close
          </button>
          {mode === 'merge' && flag.status === 'Pending' && (
            <>
              <button className="modal-btn secondary" onClick={handleDismiss} disabled={submitting}>
                Not a Duplicate
              </button>
              <button className="modal-btn primary" onClick={handleMerge} disabled={submitting || !primaryId}>
                {submitting ? 'Merging…' : 'Confirm Merge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicateFlagModal;
