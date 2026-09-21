import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listBackups, createBackup, verifyBackup, downloadBackup } from '../../lib/settings';
import type { DbBackup } from '../../lib/settings';
import { PlusIcon, DownloadIcon, CheckCircleIcon } from '../../components/layout/Icons';
import { formatBytes, formatDateTime } from './settingsUtils';

const BackupTab = () => {
  const { data: backups, loading, error, reload } = useApiData(listBackups);
  const [creating, setCreating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const messageOf = (err: unknown, fallback: string) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

  const handleCreate = async () => {
    setCreating(true);
    setActionError(null);
    try {
      await createBackup();
      reload();
    } catch (err) {
      setActionError(messageOf(err, 'The backup could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async (backup: DbBackup) => {
    setVerifyingId(backup.backup_id);
    setActionError(null);
    try {
      await verifyBackup(backup.backup_id);
      reload();
    } catch (err) {
      setActionError(messageOf(err, 'The backup could not be checked.'));
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="card">
      <div className="rp-panel-header">
        <div>
          <h3 className="card-title">Database Backups</h3>
          <span className="card-subtitle">
            Each backup is one file holding the whole database plus every uploaded photo, attachment and letter. Download it and
            keep a copy somewhere other than this computer. Restoring is a maintenance procedure done with the system stopped
            (deploy/restore.sh), not something done from this screen.
          </span>
        </div>
        <button className="pat-btn primary" disabled={creating} onClick={handleCreate}>
          <PlusIcon /> {creating ? 'Creating…' : 'Create Backup'}
        </button>
      </div>

      {error && <div className="dash-error-banner">Couldn't load backups: {error}</div>}
      {actionError && <div className="dash-error-banner">{actionError}</div>}

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
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default BackupTab;
