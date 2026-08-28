import type { SecurityUser } from '../../lib/security';
import { XIcon, EditIcon } from '../../components/layout/Icons';
import { ROLE_BADGE, ROLE_LABEL, STATUS_BADGE, formatDateTime, initials, userStatus } from './usersRolesUtils';

interface ViewUserModalProps {
  user: SecurityUser;
  onClose: () => void;
  onEdit: () => void;
}

const ViewUserModal = ({ user, onClose, onEdit }: ViewUserModalProps) => {
  const status = userStatus(user);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 className="modal-title">User Details</h2>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0' }}>
          <div className="ur-avatar" style={{ width: 52, height: 52, fontSize: 17 }}>
            {initials(user.username)}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{user.username}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <span className={`badge ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
              <span className={`badge ${STATUS_BADGE[status]}`}>{status}</span>
            </div>
          </div>
        </div>

        <div className="modal-grid">
          <div className="modal-field">
            <label>Registration No.</label>
            <div style={{ fontSize: 13.5, color: '#334155' }}>{user.registration_number || '—'}</div>
          </div>
          <div className="modal-field">
            <label>Two-Factor Auth</label>
            <div style={{ fontSize: 13.5, color: '#334155' }}>{user.totp_enabled ? 'Enabled' : 'Not enabled'}</div>
          </div>
          <div className="modal-field">
            <label>Last Login</label>
            <div style={{ fontSize: 13.5, color: '#334155' }}>{user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'}</div>
          </div>
          <div className="modal-field">
            <label>Failed Login Attempts</label>
            <div style={{ fontSize: 13.5, color: '#334155' }}>{user.failed_login_attempts}</div>
          </div>
          {status === 'Locked' && (
            <div className="modal-field span-2">
              <label>Locked Until</label>
              <div style={{ fontSize: 13.5, color: '#b91c1c' }}>{formatDateTime(user.locked_until!)}</div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Close
          </button>
          <button className="modal-btn primary" onClick={onEdit}>
            <EditIcon /> Edit User
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewUserModal;
