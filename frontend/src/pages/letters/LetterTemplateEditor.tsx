import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getClinicSettings } from '../../lib/settings';
import {
  getLetterTemplate,
  createLetterTemplate,
  updateLetterTemplateMeta,
  replaceLetterTemplateDocx,
  fetchTemplatePreviewUrl,
  downloadBlankTemplate,
  KNOWN_PLACEHOLDERS,
  LETTER_TYPE_SUGGESTIONS,
} from '../../lib/letters';
import type { LetterTemplate, LetterTemplateMetaInput } from '../../lib/letters';
import { SaveIcon, UploadIcon, DownloadIcon, EyeIcon, RefreshIcon, AlertIcon, CheckCircleIcon } from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../settings/settings.css';

type FormState = {
  name: string;
  letter_type: string;
  clinic_name: string;
  clinic_address: string;
  phone_number: string;
  doctor_name: string;
  doctor_qualification: string;
  doctor_department: string;
  registration_number: string;
};

const emptyForm: FormState = {
  name: '',
  letter_type: 'Medical Certificate',
  clinic_name: '',
  clinic_address: '',
  phone_number: '',
  doctor_name: '',
  doctor_qualification: '',
  doctor_department: '',
  registration_number: '',
};

const toForm = (t: LetterTemplate): FormState => ({
  name: t.name,
  letter_type: t.letter_type,
  clinic_name: t.clinic_name ?? '',
  clinic_address: t.clinic_address ?? '',
  phone_number: t.phone_number ?? '',
  doctor_name: t.doctor_name ?? '',
  doctor_qualification: t.doctor_qualification ?? '',
  doctor_department: t.doctor_department ?? '',
  registration_number: t.registration_number ?? '',
});

const toInput = (f: FormState): LetterTemplateMetaInput => ({
  name: f.name.trim(),
  letter_type: f.letter_type.trim() || 'General',
  clinic_name: f.clinic_name.trim() || null,
  clinic_address: f.clinic_address.trim() || null,
  phone_number: f.phone_number.trim() || null,
  doctor_name: f.doctor_name.trim() || null,
  doctor_qualification: f.doctor_qualification.trim() || null,
  doctor_department: f.doctor_department.trim() || null,
  registration_number: f.registration_number.trim() || null,
});

const LetterTemplateEditor = () => {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const isNew = !templateId;
  const numericId = templateId ? Number(templateId) : null;

  const { data: existing } = useApiData(() => (numericId ? getLetterTemplate(numericId) : Promise.resolve(null)), [numericId]);
  const { data: clinicSettings } = useApiData(() => (isNew ? getClinicSettings().catch(() => null) : Promise.resolve(null)), [isNew]);

  const [template, setTemplate] = useState<LetterTemplate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // create flow: file chosen before the template exists
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing) {
      setTemplate(existing);
      setForm(toForm(existing));
    }
  }, [existing]);

  useEffect(() => {
    if (isNew && clinicSettings) {
      setForm((f) => ({
        ...f,
        clinic_name: f.clinic_name || clinicSettings.clinic_name || '',
        clinic_address: f.clinic_address || clinicSettings.clinic_address || '',
        registration_number: f.registration_number || clinicSettings.registration_number || '',
      }));
    }
  }, [isNew, clinicSettings]);

  const loadPreview = async (id: number) => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const url = await fetchTemplatePreviewUrl(id);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch (err: any) {
      setPreviewError(err?.response?.data?.message || 'Could not render a preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (template?.current_version) loadPreview(template.letter_template_id);
    return () => {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.letter_template_id, template?.current_version?.version_id]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Template name is required.');
    if (isNew && !pendingFile) return setError('Choose a .docx template file to upload.');
    setSaving(true);
    try {
      if (isNew) {
        const created = await createLetterTemplate(toInput(form), pendingFile as File);
        setPendingFile(null);
        setTemplate(created);
        navigate(`/letter-templates/${created.letter_template_id}`, { replace: true });
      } else {
        const updated = await updateLetterTemplateMeta(numericId as number, toInput(form));
        setTemplate(updated);
      }
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save the template.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileChosen = async (file: File) => {
    setError(null);
    if (isNew || !template) {
      setPendingFile(file);
      return;
    }
    setSaving(true);
    try {
      const updated = await replaceLetterTemplateDocx(template.letter_template_id, file);
      setTemplate(updated);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to upload the .docx.');
    } finally {
      setSaving(false);
    }
  };

  const report = template?.current_version?.placeholder_report;

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>{isNew ? 'New Letter Template' : `Edit: ${template?.name ?? '…'}`}</h1>
          <p>The uploaded Word document controls the entire layout. Doctors only ever edit the {'{{LETTER_BODY}}'} section.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => navigate('/letter-templates')}>
            Back to Templates
          </button>
          <button className="pat-btn primary" disabled={saving} onClick={handleSave}>
            <SaveIcon /> {saving ? 'Saving…' : isNew ? 'Create Template' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && <div className="modal-error" style={{ marginBottom: 16 }}>{error}</div>}
      {saved && (
        <div className="dash-error-banner" style={{ background: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0', marginBottom: 16 }}>
          Saved.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Template Info</h3>
          </div>
          <div className="modal-grid">
            <div className="modal-field">
              <label>Template Name *</label>
              <input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Medical Certificate" />
            </div>
            <div className="modal-field">
              <label>Letter Type</label>
              <input list="letter-type-options" value={form.letter_type} onChange={(e) => setField('letter_type', e.target.value)} />
              <datalist id="letter-type-options">
                {LETTER_TYPE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Word Template (.docx)</h3>
            <span className="card-subtitle">Design in Microsoft Word; the system fills placeholders and renders to PDF exactly as authored.</span>
          </div>
          <div style={{ padding: '4px 4px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="pat-btn" disabled={saving} onClick={() => fileRef.current?.click()}>
                <UploadIcon /> {isNew ? (pendingFile ? 'Change file' : 'Choose .docx') : 'Replace .docx'}
              </button>
              <button type="button" className="pat-btn" onClick={() => downloadBlankTemplate()}>
                <DownloadIcon /> Download Blank Template
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChosen(file);
                  e.target.value = '';
                }}
              />
              {isNew && pendingFile && <span className="pat-muted">{pendingFile.name} — will upload on “Create Template”.</span>}
              {!isNew && template?.current_version && (
                <span className="pat-muted">
                  Current: <strong>{template.current_version.original_filename}</strong> (v{template.current_version.version_number})
                </span>
              )}
            </div>

            {report && (
              <div className="cd-summary-box gray" style={{ marginTop: 12 }}>
                <div className="cd-summary-box-label">Placeholders detected in this version</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: report.missingBody || report.unknown.length ? 8 : 0 }}>
                  {report.found.length === 0 && <span className="pat-muted">None found.</span>}
                  {report.found.map((p) => {
                    const known = (KNOWN_PLACEHOLDERS as readonly string[]).includes(p);
                    return (
                      <span key={p} className={`badge ${known ? 'badge-blue' : 'badge-amber'}`}>
                        {`{{${p}}}`}
                      </span>
                    );
                  })}
                </div>
                {report.missingBody && (
                  <div style={{ color: '#b45309', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertIcon /> This template has no {'{{LETTER_BODY}}'} — doctors will have nowhere to type the letter content.
                  </div>
                )}
                {report.unknown.length > 0 && (
                  <div style={{ color: '#b45309', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <AlertIcon /> Unknown placeholder(s) will render empty: {report.unknown.map((u) => `{{${u}}}`).join(', ')}
                  </div>
                )}
                {!report.missingBody && report.unknown.length === 0 && (
                  <div style={{ color: '#15803d', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircleIcon /> All placeholders recognised.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Letterhead Values</h3>
            <span className="card-subtitle">Fill the {'{{CLINIC_*}}'} / {'{{DOCTOR_*}}'} / {'{{PHONE}}'} / {'{{REGISTRATION_NO}}'} placeholders. Leave blank any you hard-coded in Word.</span>
          </div>
          <div className="modal-grid">
            <div className="modal-field span-2">
              <label>Clinic / Hospital Name</label>
              <input value={form.clinic_name} onChange={(e) => setField('clinic_name', e.target.value)} />
            </div>
            <div className="modal-field span-2">
              <label>Clinic Address</label>
              <input value={form.clinic_address} onChange={(e) => setField('clinic_address', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Phone</label>
              <input value={form.phone_number} onChange={(e) => setField('phone_number', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Doctor Name</label>
              <input value={form.doctor_name} onChange={(e) => setField('doctor_name', e.target.value)} placeholder="e.g. Dr. Athula (blank = logged-in doctor)" />
            </div>
            <div className="modal-field">
              <label>Doctor Qualification</label>
              <input value={form.doctor_qualification} onChange={(e) => setField('doctor_qualification', e.target.value)} placeholder="e.g. MBBS, MD" />
            </div>
            <div className="modal-field">
              <label>Doctor Department</label>
              <input value={form.doctor_department} onChange={(e) => setField('doctor_department', e.target.value)} />
            </div>
            <div className="modal-field">
              <label>Registration No.</label>
              <input value={form.registration_number} onChange={(e) => setField('registration_number', e.target.value)} />
            </div>
          </div>
        </div>

        {!isNew && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Preview</h3>
              <span className="card-subtitle">Sample data — Test Patient · 27 August 2026 · Dr. Athula. Save letterhead changes to refresh.</span>
              <button
                className="pat-btn"
                style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px' }}
                disabled={!template?.current_version || previewLoading}
                onClick={() => template && loadPreview(template.letter_template_id)}
              >
                <RefreshIcon /> {previewLoading ? 'Rendering…' : 'Refresh'}
              </button>
            </div>
            <div style={{ padding: 4 }}>
              {previewError && <div className="modal-error">{previewError}</div>}
              {!template?.current_version ? (
                <div className="pat-empty">Upload a .docx to see a preview.</div>
              ) : previewUrl ? (
                <>
                  <iframe
                    title="Template preview"
                    src={previewUrl}
                    style={{ width: '100%', height: 720, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <a className="card-link" href={previewUrl} target="_blank" rel="noreferrer">
                      <EyeIcon /> Open preview in a new tab
                    </a>
                  </div>
                </>
              ) : (
                <div className="pat-empty">{previewLoading ? 'Rendering preview…' : 'No preview yet.'}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LetterTemplateEditor;
