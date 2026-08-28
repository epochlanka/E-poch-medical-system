import { useState } from 'react';
import { createUser, updateUser, ROLES } from '../../lib/security';
import type { SecurityUser, Role } from '../../lib/security';
import { XIcon } from '../../components/layout/Icons';
import { ROLE_LABEL } from './usersRolesUtils';

interface UserFormModalProps {
  user?: SecurityUser;
  onClose: () => void;
  onSaved: () => void;
}

const UserFormModal = ({ user, onClose, onSaved }: UserFormModalProps) => {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'Receptionist');
  const [registrationNumber, setRegistrationNumber] = useState(user?.registration_number ?? '');
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateUser(user!.user_id, { role, registration_number: registrationNumber || undefined, is_active: isActive });
      } else {
        if (!username.trim()) throw new Error('Username is required');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');
        await createUser({ username: username.trim(), password, role, registration_number: registrationNumber || undefined });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">{isEdit ? 'Edit User' : 'Add New User'}</h2>
            <p className="modal-subtitle">{isEdit ? `Update ${user!.username}'s role and status.` : 'Create a new staff login.'}</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-field span-2">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} disabled={isEdit} placeholder="e.g. jperera" />
          </div>

          {!isEdit && (
            <div className="modal-field span-2">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
            </div>
          )}

          <div className="modal-field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-field">
            <label>Registration No. (optional)</label>
            <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="e.g. SLMC-12345" />
          </div>

          {isEdit && (
            <div className="modal-field span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 'auto' }} />
                Active
              </label>
            </div>
          )}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal;
