import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listBackups, createBackup, verifyBackup, downloadBackup } from '../../lib/settings';
import type { DbBackup } from '../../lib/settings';
import { PlusIcon, DownloadIcon, CheckCircleIcon, RefreshIcon } from '../../components/layout/Icons';
import { formatBytes, formatDateTime } from './settingsUtils';
import RestoreConfirmModal from './RestoreConfirmModal';

const BackupTab = () => {
  const { data: backups, loading, error, reload } = useApiData(listBackups);
  const [creating, setCreating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<DbBackup | null>(null);
  const [restoreWarning, setRestoreWarning] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createBackup();
      reload();
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async (backup: DbBackup) => {
    setVerifyingId(backup.backup_id);
    try {
      await verifyBackup(backup.backup_id);
      reload();
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="card">
      <div className="rp-panel-header">
        <div>
          <h3 className="card-title">Database Backups</h3>
          <span className="card-subtitle">On-demand SQLite file snapshots. Restoring replaces the live database.</span>
        </div>
        <button className="pat-btn primary" disabled={creating} onClick={handleCreate}>
          <PlusIcon /> {creating ? 'Creating…' : 'Create Backup'}
        </button>
      </div>

      {error && <div className="dash-error-banner">Couldn't load backups: {error}</div>}
      {restoreWarning && (
        <div className="dash-error-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          {restoreWarning}
        </div>
      )}

      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Size</th>
              <th>Created By</th>
              <th>Created At</th>
              <th>Verified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="pat-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && (backups?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="pat-empty">No backups yet — create one to get started.</div>
                </td>
              </tr>
            )}
            {!loading &&
              backups?.map((b) => (
                <tr key={b.backup_id}>
                  <td>{b.filename}</td>
                  <td className="pat-muted">{formatBytes(b.size_bytes)}</td>
                  <td>{b.creator.username}</td>
                  <td>{formatDateTime(b.created_at)}</td>
                  <td>
                    {b.verified ? (
                      <span className="badge badge-green">Verified</span>
                    ) : (
                      <span className="badge badge-gray">Unverified</span>
                    )}
                  </td>
                  <td>
                    <div className="pat-actions-cell">
                      <button className="pat-btn" style={{ padding: '6px 10px', fontSize: 12 }} disabled={verifyingId === b.backup_id} onClick={() => handleVerify(b)}>
                        <CheckCircleIcon /> {verifyingId === b.backup_id ? 'Checking…' : 'Verify'}
                      </button>
                      <button className="pat-icon-btn" onClick={() => downloadBackup(b.backup_id, b.filename)} aria-label="Download">
                        <DownloadIcon />
                      </button>
                      <button className="pat-btn" style={{ padding: '6px 10px', fontSize: 12, color: '#dc2626' }} onClick={() => setRestoreTarget(b)}>
                        <RefreshIcon /> Restore
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {restoreTarget && (
        <RestoreConfirmModal
          backup={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onRestored={(warning) => {
            setRestoreTarget(null);
            setRestoreWarning(warning);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default BackupTab;
