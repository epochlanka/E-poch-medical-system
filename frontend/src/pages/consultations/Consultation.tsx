import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listMasterData } from '../../lib/settings';
import {
  getConsultationContext,
  createConsultation,
  updateConsultation,
  finalizeConsultation,
  uploadConsultationDocument,
  deleteConsultationDocument,
} from '../../lib/consultations';
import type { ConsultationInput } from '../../lib/consultations';
import { PrintIcon, ChevronLeftIcon, SaveIcon, PrescriptionIcon } from '../../components/layout/Icons';
import { initials, calculateAge, parseDiagnosisList, joinDiagnosisList } from './consultationUtils';
import type { ConsultationFormState } from './ConsultationTab';
import ConsultationTab from './ConsultationTab';
import HistoryTab from './HistoryTab';
import DocumentsTab from './DocumentsTab';
import LabTestsTab from './LabTestsTab';
import FollowUpsTab from './FollowUpsTab';
import BillingTab from './BillingTab';
import Sidebar from './Sidebar';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../families/families.css';
import './consultation.css';

const TABS = [
  { key: 'consultation', label: 'Consultation' },
  { key: 'history', label: 'History' },
  { key: 'documents', label: 'Documents' },
  { key: 'labtests', label: 'Lab Tests' },
  { key: 'followups', label: 'Follow Ups' },
  { key: 'billing', label: 'Billing' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const emptyForm: ConsultationFormState = {
  complaint: '',
  history_of_present_illness: '',
  examination_findings: '',
  medical_history: [],
  notes: '',
  allergies_ack: false,
  vitals: { bp_systolic: '', bp_diastolic: '', temp: '', pulse: '', respiratory_rate: '', spo2: '', weight: '', height: '' },
  diagnosisList: [],
};

const numOrUndefined = (s: string) => (s.trim() === '' ? undefined : Number(s));

const Consultation = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const id = Number(appointmentId);

  const { data: context, loading, error, reload } = useApiData(() => getConsultationContext(id), [id]);
  const { data: conditionOptions } = useApiData(() => listMasterData('MedicalCondition').then((items) => items.map((i) => i.value)));

  const [tab, setTab] = useState<TabKey>('consultation');
  const [form, setForm] = useState<ConsultationFormState>(emptyForm);
  const [followUpDate, setFollowUpDate] = useState('');
  const [consultationId, setConsultationId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed local editable state from the server once the context loads (or the consultation
  // changes underneath us, e.g. after the very first save creates it).
  useEffect(() => {
    if (!context) return;
    const c = context.consultation;
    setConsultationId(c?.consultation_id ?? null);
    setFollowUpDate(c?.follow_up_date ? c.follow_up_date.slice(0, 10) : '');
    setForm({
      complaint: c?.complaint ?? '',
      history_of_present_illness: c?.history_of_present_illness ?? '',
      examination_findings: c?.examination_findings ?? '',
      medical_history: c?.medicalHistory ?? [],
      notes: c?.notes ?? '',
      allergies_ack: c?.allergies_ack ?? false,
      vitals: {
        bp_systolic: c?.vitals?.bp_systolic?.toString() ?? '',
        bp_diastolic: c?.vitals?.bp_diastolic?.toString() ?? '',
        temp: c?.vitals?.temp?.toString() ?? '',
        pulse: c?.vitals?.pulse?.toString() ?? '',
        respiratory_rate: c?.vitals?.respiratory_rate?.toString() ?? '',
        spo2: c?.vitals?.spo2?.toString() ?? '',
        weight: c?.vitals?.weight?.toString() ?? '',
        height: c?.vitals?.height?.toString() ?? '',
      },
      diagnosisList: parseDiagnosisList(c?.diagnosis ?? null, c?.icd10_code ?? null),
    });
  }, [context]);

  const isFinalized = context?.consultation?.status === 'Finalized';

  const buildInput = (): ConsultationInput => {
    const { diagnosis, icd10_code } = joinDiagnosisList(form.diagnosisList);
    return {
      complaint: form.complaint,
      history_of_present_illness: form.history_of_present_illness,
      examination_findings: form.examination_findings,
      medical_history: form.medical_history,
      notes: form.notes,
      allergies_ack: form.allergies_ack,
      diagnosis,
      icd10_code,
      follow_up_date: followUpDate || null,
      vitals: {
        bp_systolic: numOrUndefined(form.vitals.bp_systolic),
        bp_diastolic: numOrUndefined(form.vitals.bp_diastolic),
        temp: numOrUndefined(form.vitals.temp),
        pulse: numOrUndefined(form.vitals.pulse),
        respiratory_rate: numOrUndefined(form.vitals.respiratory_rate),
        spo2: numOrUndefined(form.vitals.spo2),
        weight: numOrUndefined(form.vitals.weight),
        height: numOrUndefined(form.vitals.height),
      },
    };
  };

  // Returns the consultation id, creating the record on first save so Attach Files and the
  // Follow Ups/Billing tabs (which all need a real consultation_id) work from the first click.
  const persist = async (): Promise<number> => {
    const input = buildInput();
    if (consultationId) {
      await updateConsultation(consultationId, input);
      return consultationId;
    }
    const created = await createConsultation(id, input);
    setConsultationId(created.consultation_id);
    return created.consultation_id;
  };

  const handleSaveDraft = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await persist();
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.response?.data?.details?.map((d: any) => d.message).join(', ') || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaveError(null);
    setFinalizing(true);
    try {
      const cid = await persist();
      await finalizeConsultation(cid);
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to complete consultation.');
    } finally {
      setFinalizing(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    try {
      const cid = consultationId ?? (await persist());
      await uploadConsultationDocument(cid, file);
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (documentId: number) => {
    await deleteConsultationDocument(documentId);
    reload();
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading consultation…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this appointment: {error}</div>;

  const { patient } = context.appointment;

  return (
    <div>
      <div className="cons-header">
        <div>
          <h1>Consultations</h1>
          <div className="cons-breadcrumb">
            <button className="pat-id-link" onClick={() => navigate('/consultations')} style={{ fontSize: 12.5 }}>
              Consultations
            </button>
            <span>›</span>
            <span>{context.consultation ? 'Edit Consultation' : 'New Consultation'}</span>
          </div>
        </div>
        <div className="cons-header-actions">
          <button className="cons-btn" onClick={() => navigate('/consultations')}>
            <ChevronLeftIcon /> Back to List
          </button>
          {consultationId && (
            <button className="cons-btn" onClick={() => navigate(`/prescriptions/new/${consultationId}`)}>
              <PrescriptionIcon /> New Prescription
            </button>
          )}
          {!isFinalized && (
            <button className="cons-btn" onClick={handleSaveDraft} disabled={saving || finalizing}>
              <SaveIcon /> {saving ? 'Saving…' : 'Save as Draft'}
            </button>
          )}
          {!isFinalized && (
            <button className="cons-btn primary" onClick={handleComplete} disabled={saving || finalizing}>
              {finalizing ? 'Completing…' : 'Complete Consultation'}
            </button>
          )}
        </div>
      </div>

      {saveError && <div className="dash-error-banner">{saveError}</div>}

      <div className="cons-banner">
        {patient.photo_url ? (
          <img className="cons-banner-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
        ) : (
          <div className="cons-banner-avatar">{initials(patient.full_name)}</div>
        )}
        <div>
          <div className="cons-banner-name">
            {patient.full_name}
            {isFinalized && <span className="badge badge-green">Finalized</span>}
            {!isFinalized && context.consultation && <span className="badge badge-amber">Draft</span>}
          </div>
          <div className="cons-banner-meta">
            {patient.gender}, {calculateAge(patient.dob)} Years
          </div>
          <div className="cons-banner-sub">
            {patient.patient_id} {patient.phone ? `· ${patient.phone}` : ''}
          </div>
        </div>

        <div className="cons-banner-divider" />

        <div className="cons-banner-fields">
          <div className="cons-banner-field">
            <span className="cons-banner-label">Appointment ID</span>
            <span className="cons-banner-value link">APT-{String(context.appointment.appointmentId).padStart(6, '0')}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Date &amp; Time</span>
            <span className="cons-banner-value">{new Date(context.appointment.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Doctor</span>
            <span className="cons-banner-value">Dr. {context.appointment.doctor.username}</span>
          </div>
        </div>

        <button className="cons-btn" onClick={() => window.print()}>
          <PrintIcon /> Print
        </button>
      </div>

      <div className="cons-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`cons-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="cons-layout">
        <div>
          {tab === 'consultation' && (
            <ConsultationTab
              form={form}
              setForm={setForm}
              disabled={!!isFinalized}
              patientAllergies={patient.allergies}
              medicalConditionOptions={conditionOptions ?? []}
              documents={context.consultation?.documents ?? []}
              onUploadFile={handleUploadFile}
              onDeleteFile={handleDeleteFile}
              uploading={uploading}
            />
          )}
          {tab === 'history' && <HistoryTab patientId={patient.patient_id} />}
          {tab === 'documents' && (
            <DocumentsTab
              documents={context.consultation?.documents ?? []}
              disabled={!!isFinalized}
              uploading={uploading}
              onUploadFile={handleUploadFile}
              onDeleteFile={handleDeleteFile}
              hasConsultation={!!consultationId}
            />
          )}
          {tab === 'labtests' && <LabTestsTab />}
          {tab === 'followups' && (
            <FollowUpsTab
              followUpDate={followUpDate}
              setFollowUpDate={setFollowUpDate}
              disabled={!!isFinalized}
              savedFollowUpDate={context.consultation?.follow_up_date ?? null}
            />
          )}
          {tab === 'billing' && <BillingTab consultationId={consultationId} invoices={context.consultation?.invoices ?? []} onCreated={reload} />}
        </div>

        <Sidebar context={context} />
      </div>
    </div>
  );
};

export default Consultation;
