import { useEffect, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getClinicSettings, updateClinicSettings } from '../../lib/settings';
import { formatDateTime } from './settingsUtils';

const GeneralTab = () => {
  const { data: settings, loading, error, reload } = useApiData(getClinicSettings);

  const [form, setForm] = useState({
    clinic_name: '',
    clinic_address: '',
    registration_number: '',
    logo_url: '',
    default_consultation_fee: '500',
    expiry_alert_threshold_days: '90',
    session_timeout_minutes: '15',
    account_lockout_minutes: '15',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      clinic_name: settings.clinic_name,
      clinic_address: settings.clinic_address ?? '',
      registration_number: settings.registration_number ?? '',
      logo_url: settings.logo_url ?? '',
      default_consultation_fee: String(settings.default_consultation_fee),
      expiry_alert_threshold_days: String(settings.expiry_alert_threshold_days),
      session_timeout_minutes: String(settings.session_timeout_minutes),
      account_lockout_minutes: String(settings.account_lockout_minutes),
    });
  }, [settings]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!form.clinic_name.trim()) {
      setSaveError('Clinic name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateClinicSettings({
        clinic_name: form.clinic_name.trim(),
        clinic_address: form.clinic_address.trim() || undefined,
        registration_number: form.registration_number.trim() || undefined,
        logo_url: form.logo_url.trim() || undefined,
        default_consultation_fee: Number(form.default_consultation_fee),
        expiry_alert_threshold_days: Number(form.expiry_alert_threshold_days),
        session_timeout_minutes: Number(form.session_timeout_minutes),
        account_lockout_minutes: Number(form.account_lockout_minutes),
      });
      setSaved(true);
      reload();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card-empty">Loading…</div>;
  if (error) return <div className="dash-error-banner">Couldn't load clinic settings: {error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Clinic Profile</h3>
          <span className="card-subtitle">Shown on printed prescriptions, invoices, and reports.</span>
        </div>
        <div className="modal-grid">
          <div className="modal-field span-2">
            <label>Clinic Name *</label>
            <input value={form.clinic_name} onChange={(e) => setField('clinic_name', e.target.value)} />
          </div>
          <div className="modal-field span-2">
            <label>Address</label>
            <input value={form.clinic_address} onChange={(e) => setField('clinic_address', e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Registration Number</label>
            <input value={form.registration_number} onChange={(e) => setField('registration_number', e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Logo URL</label>
            <input value={form.logo_url} onChange={(e) => setField('logo_url', e.target.value)} placeholder="https://…" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Fees &amp; Alerts</h3>
        </div>
        <div className="modal-grid">
          <div className="modal-field">
            <label>Default Consultation Fee (LKR)</label>
            <input type="number" min={0} step="0.01" value={form.default_consultation_fee} onChange={(e) => setField('default_consultation_fee', e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Expiry Alert Threshold (days)</label>
            <input type="number" min={1} value={form.expiry_alert_threshold_days} onChange={(e) => setField('expiry_alert_threshold_days', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Security</h3>
        </div>
        <div className="modal-grid">
          <div className="modal-field">
            <label>Session Timeout (minutes)</label>
            <input type="number" min={1} value={form.session_timeout_minutes} onChange={(e) => setField('session_timeout_minutes', e.target.value)} />
          </div>
          <div className="modal-field">
            <label>Account Lockout Duration (minutes)</label>
            <input type="number" min={1} value={form.account_lockout_minutes} onChange={(e) => setField('account_lockout_minutes', e.target.value)} />
          </div>
        </div>
      </div>

      {saveError && <div className="modal-error">{saveError}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="pat-muted" style={{ fontSize: 12.5 }}>
          {settings?.updater ? `Last updated by ${settings.updater.username} on ${formatDateTime(settings.updated_at)}` : 'Not yet updated.'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && <span style={{ color: '#16a34a', fontSize: 12.5, fontWeight: 600 }}>Saved</span>}
          <button className="modal-btn primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
