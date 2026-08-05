import { useState } from 'react';
import { restoreBackup } from '../../lib/settings';
import type { DbBackup } from '../../lib/settings';
import { XIcon, AlertIcon } from '../../components/layout/Icons';
import { formatDateTime } from './settingsUtils';

interface RestoreConfirmModalProps {
  backup: DbBackup;
  onClose: () => void;
  onRestored: (warning: string) => void;
}

const RestoreConfirmModal = ({ backup, onClose, onRestored }: RestoreConfirmModalProps) => {
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim().toUpperCase() === 'RESTORE';

  const handleRestore = async () => {
    if (!canConfirm) return;
    setError(null);
    setRestoring(true);
    try {
      const result = await restoreBackup(backup.backup_id);
      onRestored(result.warning);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to restore backup.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="modal-title">Restore Database</h2>
            <p className="modal-subtitle">This replaces the live database file. It cannot be undone from within the app.</p>
          </div>
          <button className="pat-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>

        <div className="alert-row" style={{ background: '#fef2f2', borderRadius: 10, padding: 12 }}>
          <div className="alert-icon red">
            <AlertIcon />
          </div>
          <div className="alert-text">
            You're about to restore <strong>{backup.filename}</strong> (created {formatDateTime(backup.created_at)}). Every change made after that
            backup was taken will be lost. A safety backup of the current database is taken automatically first, but the backend process must be
            restarted afterward for every connection to see the restored data consistently.
          </div>
        </div>

        <div className="modal-field span-2" style={{ marginTop: 14 }}>
          <label>
            Type <strong>RESTORE</strong> to confirm
          </label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="modal-btn secondary" onClick={onClose} disabled={restoring}>
            Cancel
          </button>
          <button className="modal-btn primary" style={{ background: '#dc2626' }} disabled={!canConfirm || restoring} onClick={handleRestore}>
            {restoring ? 'Restoring…' : 'Restore Database'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreConfirmModal;
