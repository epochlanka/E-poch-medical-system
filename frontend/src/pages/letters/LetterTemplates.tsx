import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import {
  listLetterTemplates,
  setLetterTemplateActive,
  deleteLetterTemplate,
  fetchTemplatePreviewUrl,
  downloadBlankTemplate,
} from '../../lib/letters';
import { PlusIcon, EditIcon, FileIcon, EyeIcon, TrashIcon, DownloadIcon, AlertIcon } from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../patients/patients.css';

const LetterTemplates = () => {
  const navigate = useNavigate();
  const { data: templates, loading, error, reload } = useApiData(() => listLetterTemplates());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleToggleActive = async (id: number, isActive: boolean) => {
    setBusyId(id);
    setActionError(null);
    try {
      await setLetterTemplateActive(id, !isActive);
      reload();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to update template.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number, name: string, issuedCount: number) => {
    const warning =
      issuedCount > 0
        ? `Delete "${name}"? ${issuedCount} letter(s) already issued from it will stay in patient history unchanged, but the template can no longer be used.`
        : `Delete "${name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    setBusyId(id);
    setActionError(null);
    try {
      await deleteLetterTemplate(id);
      reload();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Failed to delete template.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePreview = async (id: number) => {
    setBusyId(id);
    setActionError(null);
    try {
      const url = await fetchTemplatePreviewUrl(id);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'Could not render a preview.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Letter Templates</h1>
          <p>Upload the Word (.docx) letters doctors issue. Design them in Microsoft Word — the system only fills in placeholders.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => downloadBlankTemplate()}>
            <DownloadIcon /> Blank Template
          </button>
          <button className="pat-btn primary" onClick={() => navigate('/letter-templates/new')}>
            <PlusIcon /> New Template
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load letter templates: {error}</div>}
      {actionError && <div className="dash-error-banner">{actionError}</div>}

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Placeholders</th>
                <th>Status</th>
                <th>Action</th>
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
              {!loading && (templates?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="pat-empty">No letter templates yet. Upload a .docx to let doctors start issuing letters.</div>
                  </td>
                </tr>
              )}
              {!loading &&
                templates?.map((t) => {
                  const report = t.current_version?.placeholder_report;
                  const hasWarning = !!report && (report.missingBody || report.unknown.length > 0);
                  return (
                    <tr key={t.letter_template_id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="rx-icon">
                            <FileIcon />
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{t.name}</div>
                            {t.current_version && (
                              <div className="pat-muted" style={{ fontSize: 11.5 }}>
                                {t.current_version.original_filename}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{t.letter_type}</td>
                      <td>{t.current_version ? `v${t.current_version.version_number}` : '—'}</td>
                      <td>
                        {!report ? (
                          <span className="pat-muted">—</span>
                        ) : hasWarning ? (
                          <span className="badge badge-amber" title={[
                            report.missingBody ? 'No {{LETTER_BODY}} placeholder' : '',
                            report.unknown.length ? `Unknown: ${report.unknown.join(', ')}` : '',
                          ].filter(Boolean).join(' · ')}>
                            <AlertIcon /> Check
                          </span>
                        ) : (
                          <span className="badge badge-green">{report.found.length} OK</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" title="Edit" disabled={busyId === t.letter_template_id} onClick={() => navigate(`/letter-templates/${t.letter_template_id}`)}>
                            <EditIcon />
                          </button>
                          <button className="pat-icon-btn" title="Preview" disabled={busyId === t.letter_template_id || !t.current_version} onClick={() => handlePreview(t.letter_template_id)}>
                            <EyeIcon />
                          </button>
                          <button className="pat-icon-btn" title="Delete" disabled={busyId === t.letter_template_id} onClick={() => handleDelete(t.letter_template_id, t.name, t.issued_count)}>
                            <TrashIcon />
                          </button>
                          <button
                            className="pat-btn"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            disabled={busyId === t.letter_template_id}
                            onClick={() => handleToggleActive(t.letter_template_id, t.is_active)}
                          >
                            {t.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LetterTemplates;
