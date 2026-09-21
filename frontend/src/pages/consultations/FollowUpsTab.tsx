import { ClockIcon } from '../../components/layout/Icons';
import { formatDate } from './consultationUtils';

interface FollowUpsTabProps {
  followUpDate: string;
  setFollowUpDate: (v: string) => void;
  disabled: boolean;
  savedFollowUpDate: string | null;
}

const FollowUpsTab = ({ followUpDate, setFollowUpDate, disabled, savedFollowUpDate }: FollowUpsTabProps) => {
  const isOverdue = savedFollowUpDate ? new Date(savedFollowUpDate) < new Date(new Date().toDateString()) : false;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Follow-up</h3>
      </div>

      {savedFollowUpDate && (
        <div className="cons-side-item" style={{ marginBottom: 14 }}>
          <span className="cons-side-icon" style={{ background: isOverdue ? '#fee2e2' : '#dcfce7', color: isOverdue ? '#dc2626' : '#16a34a' }}>
            <ClockIcon />
          </span>
          <div>
            <div className="cons-side-label">{isOverdue ? 'Overdue since' : 'Scheduled for'}</div>
            <div className="cons-side-value">{formatDate(savedFollowUpDate)}</div>
          </div>
        </div>
      )}

      <div className="modal-field" style={{ maxWidth: 280 }}>
        <label>Follow-up date</label>
        <input
          type="date"
          className="cons-input"
          disabled={disabled}
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
        />
      </div>
      <p className="card-subtitle" style={{ marginTop: 10 }}>
        Saved with Save as Draft / Complete Consultation. Clear the date and save again to remove a follow-up.
      </p>
    </div>
  );
};

export default FollowUpsTab;
