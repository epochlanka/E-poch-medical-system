import { useState } from 'react';
import { resetPassword } from '../../lib/security';
import type { SecurityUser } from '../../lib/security';
import { XIcon } from '../../components/layout/Icons';

interface ResetPasswordModalProps {
  user: SecurityUser;
  onClose: () => void;
  onSaved: () => void;
}

const ResetPasswordModal = ({ user, onClose, onSaved }: ResetPasswordModalProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(user.user_id, newPassword);
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Reset Password</h2>
            <p className="modal-subtitle">
              Set a new password for <strong>{user.username}</strong>. This signs them out of every active session.
            </p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-field span-2">
            <label>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" />
          </div>
          <div className="modal-field span-2">
            <label>Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
