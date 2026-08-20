import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { getConsultationContext, createConsultation, updateConsultation, finalizeConsultation, listAmendments, AMENDABLE_FIELDS } from '../../lib/consultations';
import type { ConsultationInput, AmendmentEntry, AmendableField } from '../../lib/consultations';
import { searchIcd11 } from '../../lib/icd11';
import type { Icd11Match } from '../../lib/icd11';
import { listLabTestOrders, printLabTestOrder, printLabResultReport } from '../../lib/labTestOrders';
import type { LabTestOrder } from '../../lib/labTestOrders';
import AmendModal from './AmendModal';
import AddLabTestModal from '../labTestOrders/AddLabTestModal';
import MarkReceivedModal from '../labTestOrders/MarkReceivedModal';
import LabResultModal from '../labTestOrders/LabResultModal';
import { getLiveQueue, calculateAge, tokenNumber } from '../../lib/queue';
import { updatePatientAllergies } from '../../lib/patients';
import {
  ChevronLeftIcon,
  RefreshIcon,
  SaveIcon,
  CheckCircleIcon,
  PrescriptionIcon,
  ClipboardIcon,
  AlertIcon,
  PlusIcon,
  EditIcon,
  PrintIcon,
} from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import './consultation.css';
import '../labTestOrders/labTestOrders.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const TABS = [
  { key: 'consultation', label: 'Consultation' },
  { key: 'examination', label: 'Examination' },
  { key: 'prescription', label: 'Prescription' },
  { key: 'laborders', label: 'Lab Orders' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'history', label: 'History' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface FormState {
  complaint: string;
  history_of_present_illness: string;
  examination_findings: string;
  medical_history: string[];
  diagnosis: string;
  icd10_code: string;
  notes: string;
  allergies_ack: boolean;
  vitals: {
    bp_systolic: string;
    bp_diastolic: string;
    temp: string;
    pulse: string;
    respiratory_rate: string;
    spo2: string;
    weight: string;
    height: string;
  };
}

const emptyForm: FormState = {
  complaint: '',
  history_of_present_illness: '',
  examination_findings: '',
  medical_history: [],
  diagnosis: '',
  icd10_code: '',
  notes: '',
  allergies_ack: false,
  vitals: { bp_systolic: '', bp_diastolic: '', temp: '', pulse: '', respiratory_rate: '', spo2: '', weight: '', height: '' },
};

const numOrUndefined = (s: string) => (s.trim() === '' ? undefined : Number(s));

// Landing view when no appointment is specified — routes the doctor straight to whichever
// appointment of theirs is currently Consulting, or offers a pick list / a way back to Call Next.
const WorkspacePicker = () => {
  const navigate = useNavigate();
  const { data: queue, loading } = useApiData(getLiveQueue);
  const consulting = (queue ?? []).filter((a) => a.status === 'Consulting');

  useEffect(() => {
    if (consulting.length === 1) navigate(`/consultations/workspace/${consulting[0].appointment_id}`, { replace: true });
  }, [consulting.length]);

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;

  if (consulting.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <ClipboardIcon />
        <h3 style={{ margin: '12px 0 4px', color: '#334155' }}>No patient is currently in consultation</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>Start a consultation from Call Next to open the workspace.</p>
        <button className="pat-btn primary" onClick={() => navigate('/queue/call-next')}>
          Go to Call Next
        </button>
      </div>
    );
  }

  return (
    <div className="pat-table-card">
      <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Choose a patient</h3>
      </div>
      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Token No.</th>
              <th>Patient Name</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {consulting.map((a) => (
              <tr key={a.appointment_id}>
                <td>
                  <span className="q-token next">{tokenNumber(a.appointment_id)}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{a.patient.full_name}</td>
                <td>
                  <button className="pat-btn primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => navigate(`/consultations/workspace/${a.appointment_id}`)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ConsultationWorkspace = () => {
  const { appointmentId } = useParams();
  if (!appointmentId) return <WorkspacePicker />;
  return <Workspace appointmentId={Number(appointmentId)} />;
};

const Workspace = ({ appointmentId }: { appointmentId: number }) => {
  const navigate = useNavigate();
  const { data: context, loading, error, reload } = useApiData(() => getConsultationContext(appointmentId), [appointmentId]);

  const [tab, setTab] = useState<TabKey>('consultation');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [followUpDate, setFollowUpDate] = useState('');
  const [consultationId, setConsultationId] = useState<number | null>(null);
  const [conditionDraft, setConditionDraft] = useState('');
  const [editingVitals, setEditingVitals] = useState(false);
  const [editingAllergies, setEditingAllergies] = useState(false);
  const [allergiesDraft, setAllergiesDraft] = useState('');
  const [savingAllergies, setSavingAllergies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendments, setAmendments] = useState<AmendmentEntry[] | null>(null);
  const [amendReloadToken, setAmendReloadToken] = useState(0);

  const [diagnosisResults, setDiagnosisResults] = useState<Icd11Match[]>([]);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState(false);
  const diagnosisBoxRef = useRef<HTMLDivElement>(null);
  const skipNextDiagnosisSearchRef = useRef(false);

  useEffect(() => {
    if (!context) return;
    const c = context.consultation;
    setConsultationId(c?.consultation_id ?? null);
    setFollowUpDate(c?.follow_up_date ? c.follow_up_date.slice(0, 10) : '');
    skipNextDiagnosisSearchRef.current = true;
    setForm({
      complaint: c?.complaint ?? '',
      history_of_present_illness: c?.history_of_present_illness ?? '',
      examination_findings: c?.examination_findings ?? '',
      medical_history: c?.medicalHistory ?? [],
      diagnosis: c?.diagnosis ?? '',
      icd10_code: c?.icd10_code ?? '',
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
    });
  }, [context]);

  const isConsultationFinalized = context?.consultation?.status === 'Finalized';
  useEffect(() => {
    if (!consultationId || !isConsultationFinalized) {
      setAmendments(null);
      return;
    }
    let cancelled = false;
    listAmendments(consultationId).then((entries) => {
      if (!cancelled) setAmendments(entries);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetches after a successful amend too (amendReloadToken bump), not just on mount/status
    // change — consultationId and status both stay the same across an amend, so without this the
    // freshly-saved entry silently wouldn't show up until the next full page load.
  }, [consultationId, isConsultationFinalized, amendReloadToken]);

  const [labTestOrders, setLabTestOrders] = useState<LabTestOrder[]>([]);
  const reloadLabTestOrders = () => {
    if (!consultationId) {
      setLabTestOrders([]);
      return;
    }
    listLabTestOrders({ consultationId }).then((result) => setLabTestOrders(result.data));
  };
  useEffect(reloadLabTestOrders, [consultationId]);

  const [addLabTestOpen, setAddLabTestOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<LabTestOrder | null>(null);
  const [resultOrder, setResultOrder] = useState<LabTestOrder | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (diagnosisBoxRef.current && !diagnosisBoxRef.current.contains(e.target as Node)) setDiagnosisOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Debounced ICD-11 search as the doctor types — skipped once right after loading a consultation
  // or picking a suggestion, so the dropdown doesn't pop back open from a programmatic change.
  useEffect(() => {
    if (skipNextDiagnosisSearchRef.current) {
      skipNextDiagnosisSearchRef.current = false;
      return;
    }
    if (form.diagnosis.trim().length < 2) {
      setDiagnosisResults([]);
      setDiagnosisError(false);
      return;
    }
    const t = setTimeout(() => {
      searchIcd11(form.diagnosis)
        .then((results) => {
          setDiagnosisResults(results);
          setDiagnosisError(false);
          setDiagnosisOpen(true);
        })
        .catch(() => {
          setDiagnosisResults([]);
          setDiagnosisError(true);
          setDiagnosisOpen(true);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [form.diagnosis]);

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading consultation…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this appointment: {error}</div>;

  const { appointment } = context;
  const { patient } = appointment;
  const consultation = context.consultation;
  const isFinalized = consultation?.status === 'Finalized';
  const canStart = appointment.status === 'Consulting';
  const canEdit = !isFinalized && (canStart || !!consultation);

  const amendCurrentValues: Record<AmendableField, string> = {
    complaint: form.complaint,
    history_of_present_illness: form.history_of_present_illness,
    examination_findings: form.examination_findings,
    diagnosis: form.diagnosis,
    icd10_code: form.icd10_code,
    notes: form.notes,
    follow_up_date: followUpDate,
  };
  const handleAmended = () => {
    setShowAmendModal(false);
    reload();
    setAmendReloadToken((t) => t + 1);
  };

  const setField = (field: keyof Omit<FormState, 'vitals' | 'medical_history' | 'allergies_ack'>) => (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const setVital = (field: keyof FormState['vitals']) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [field]: e.target.value } }));

  const selectDiagnosis = (m: Icd11Match) => {
    skipNextDiagnosisSearchRef.current = true;
    setForm((f) => ({ ...f, diagnosis: m.title, icd10_code: m.code }));
    setDiagnosisOpen(false);
    setDiagnosisResults([]);
  };
  const clearIcd11Code = () => setForm((f) => ({ ...f, icd10_code: '' }));

  const weightNum = parseFloat(form.vitals.weight);
  const heightNum = parseFloat(form.vitals.height);
  const bmi = weightNum > 0 && heightNum > 0 ? Math.round((weightNum / (heightNum / 100) ** 2) * 10) / 10 : null;

  const addCondition = () => {
    const value = conditionDraft.trim();
    if (!value || form.medical_history.includes(value)) return;
    setForm((f) => ({ ...f, medical_history: [...f.medical_history, value] }));
    setConditionDraft('');
  };
  const removeCondition = (c: string) => setForm((f) => ({ ...f, medical_history: f.medical_history.filter((x) => x !== c) }));

  const buildInput = (): ConsultationInput => ({
    complaint: form.complaint,
    history_of_present_illness: form.history_of_present_illness,
    examination_findings: form.examination_findings,
    medical_history: form.medical_history,
    diagnosis: form.diagnosis,
    icd10_code: form.icd10_code,
    notes: form.notes,
    allergies_ack: form.allergies_ack,
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
  });

  const persist = async (): Promise<number> => {
    const input = buildInput();
    if (consultationId) {
      await updateConsultation(consultationId, input);
      return consultationId;
    }
    const created = await createConsultation(appointmentId, input);
    setConsultationId(created.consultation_id);
    return created.consultation_id;
  };

  const handleSaveDraft = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await persist();
      setEditingVitals(false);
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

  const startEditAllergies = () => {
    setAllergiesDraft(context.patientSummary.allergies ?? '');
    setEditingAllergies(true);
  };

  const handleSaveAllergies = async () => {
    setSaveError(null);
    setSavingAllergies(true);
    try {
      await updatePatientAllergies(patient.patient_id, allergiesDraft.trim());
      setEditingAllergies(false);
      reload();
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to update allergies.');
    } finally {
      setSavingAllergies(false);
    }
  };

  const vitalStat = (label: string, value: string, unit: string, warn = false) => (
    <div className="cons-vital-stat-box">
      <div className="cons-vital-stat-label">{label}</div>
      <div className={`cons-vital-stat-value${warn ? ' warn' : ''}`}>
        {value || '—'}
        {value && <span className="cons-vital-stat-unit">{unit}</span>}
      </div>
    </div>
  );

  const tempWarn = form.vitals.temp !== '' && parseFloat(form.vitals.temp) >= 38;

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Consultation Workspace</h1>
          <p>Manage patient consultation, notes, examination and follow-up.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate('/queue/call-next')}>
            <ChevronLeftIcon /> Back to Queue
          </button>
          <button
            className="pat-btn"
            onClick={() => {
              reload();
              reloadLabTestOrders();
            }}
          >
            <RefreshIcon /> Refresh
          </button>
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
            <span className="q-token">{tokenNumber(appointmentId)}</span>
          </div>
          <div className="cons-banner-meta">
            MRN: {patient.patient_id} &nbsp;·&nbsp; {calculateAge(patient.dob)} Y / {patient.gender}
          </div>
          {patient.phone && <div className="cons-banner-sub">{patient.phone}</div>}
        </div>

        <div className="cons-banner-divider" />

        <div className="cons-banner-fields">
          <div className="cons-banner-field">
            <span className="cons-banner-label">Arrival Time</span>
            <span className="cons-banner-value">{formatTime(appointment.scheduledAt)}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Last Visit</span>
            <span className="cons-banner-value">{context.patientSummary.lastVisit ? formatDate(context.patientSummary.lastVisit) : 'First visit'}</span>
          </div>
          <div className="cons-banner-field">
            <span className="cons-banner-label">Status</span>
            <span className={`badge ${isFinalized ? 'badge-green' : consultation ? 'badge-amber' : 'badge-gray'}`}>
              {isFinalized ? 'Finalized' : consultation ? 'Draft' : appointment.status}
            </span>
          </div>
        </div>

        {canStart && consultation && (
          <div className="cons-banner-live">
            <span className="cons-banner-live-label">
              <CheckCircleIcon /> Now in Consultation
            </span>
            <span className="cons-banner-live-value">Start Time: {formatTime(consultation.created_at)}</span>
          </div>
        )}
      </div>

      {!canStart && !consultation && (
        <div className="dash-error-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
          This appointment isn't currently in consultation, so a new consultation record can't be started here.
        </div>
      )}

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
            <div className="cons-main">
              {context.patientSummary.allergies && (
                <div className="cons-box span-2" style={{ background: '#fffbeb', borderColor: '#fde68a', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#b45309' }}>
                    <AlertIcon />
                  </span>
                  <span style={{ fontSize: 13, color: '#92400e', flex: 1 }}>
                    Known allergies: <strong>{context.patientSummary.allergies}</strong>
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={form.allergies_ack}
                      disabled={!canEdit}
                      onChange={(e) => setForm((f) => ({ ...f, allergies_ack: e.target.checked }))}
                    />
                    Reviewed
                  </label>
                </div>
              )}

              <div className="cons-box span-2">
                <div className="cons-box-title">Chief Complaint / Reason for Visit *</div>
                <textarea
                  className="cons-textarea"
                  rows={2}
                  disabled={!canEdit}
                  value={form.complaint}
                  onChange={setField('complaint')}
                  placeholder="Enter patient's chief complaint..."
                />
              </div>

              <div className="cons-box span-2">
                <div className="cons-box-title">History of Present Illness</div>
                <textarea
                  className="cons-textarea"
                  rows={4}
                  disabled={!canEdit}
                  value={form.history_of_present_illness}
                  onChange={setField('history_of_present_illness')}
                  placeholder="Enter history of present illness..."
                />
              </div>

              <div className="cons-box span-2">
                <div className="cons-box-title">Medical History</div>
                <div className="cons-chip-row">
                  <input
                    className="cons-input"
                    disabled={!canEdit}
                    placeholder="Type a condition and press Add (e.g. Hypertension)"
                    value={conditionDraft}
                    onChange={(e) => setConditionDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition())}
                  />
                  <button type="button" className="cons-btn primary" disabled={!canEdit || !conditionDraft.trim()} onClick={addCondition}>
                    <PlusIcon /> Add
                  </button>
                </div>
                <div className="cons-chips">
                  {form.medical_history.map((c) => (
                    <span className="cons-chip" key={c}>
                      {c}
                      {canEdit && (
                        <button type="button" onClick={() => removeCondition(c)} aria-label={`Remove ${c}`}>
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {form.medical_history.length === 0 && (
                    <span className="pat-muted" style={{ fontSize: 12.5 }}>
                      No conditions tagged for this visit.
                    </span>
                  )}
                </div>
              </div>

              <div className="cons-box span-2" ref={diagnosisBoxRef}>
                <div className="cons-box-title">Provisional Diagnosis</div>
                <div className="cons-diag-row">
                  <input
                    className="cons-input"
                    disabled={!canEdit}
                    value={form.diagnosis}
                    onChange={setField('diagnosis')}
                    onFocus={() => diagnosisResults.length > 0 && setDiagnosisOpen(true)}
                    placeholder="Type to search WHO ICD-11 diagnoses, e.g. diabetes"
                  />
                  {diagnosisOpen && (
                    <div className="cons-diag-dropdown">
                      {diagnosisError && (
                        <div className="cons-diag-empty">Suggestions unavailable — you can still type a diagnosis manually.</div>
                      )}
                      {!diagnosisError && diagnosisResults.length === 0 && <div className="cons-diag-empty">No matching ICD-11 diagnoses found.</div>}
                      {!diagnosisError &&
                        diagnosisResults.map((m) => (
                          <div className="cons-diag-result" key={m.code} onClick={() => selectDiagnosis(m)}>
                            <span className="cons-diag-result-code">{m.code}</span>
                            <span className="cons-diag-result-title">{m.title}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {form.icd10_code && (
                  <span className="cons-diag-code-chip">
                    ICD-11: {form.icd10_code}
                    {canEdit && (
                      <button type="button" onClick={clearIcd11Code} aria-label="Clear ICD-11 code">
                        ×
                      </button>
                    )}
                  </span>
                )}
              </div>

              <div className="cons-box span-2">
                <div className="cons-box-title">Consultation Notes</div>
                <textarea
                  className="cons-textarea"
                  rows={4}
                  disabled={!canEdit}
                  value={form.notes}
                  onChange={setField('notes')}
                  placeholder="Advise, treatment plan, or notes..."
                />
              </div>

              {!isFinalized && (
                <div className="span-2" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="cons-btn" disabled={!canEdit || saving || finalizing} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save as Draft'}
                  </button>
                  <button className="cons-btn primary" disabled={!canEdit || saving || finalizing} onClick={handleComplete}>
                    <CheckCircleIcon /> {finalizing ? 'Completing…' : 'Complete Consultation'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'examination' && (
            <div className="cons-box">
              <div className="cons-box-title">Examination Findings</div>
              <textarea
                className="cons-textarea"
                rows={12}
                disabled={!canEdit}
                value={form.examination_findings}
                onChange={setField('examination_findings')}
                placeholder="Enter examination findings..."
              />
              {!isFinalized && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="cons-btn" disabled={!canEdit || saving} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'prescription' && (
            <div className="cons-box">
              <div className="cons-box-title">Prescriptions for this Visit</div>
              {(consultation?.prescriptions.length ?? 0) === 0 && <div className="pat-empty">No prescriptions issued for this consultation yet.</div>}
              {consultation?.prescriptions.map((p) => (
                <div className="cons-rx-row" key={p.prescription_id}>
                  <span>
                    Prescription #{p.prescription_id} {p.is_refill && <span className="badge badge-gray">Refill</span>}
                  </span>
                  <span className={`badge ${p.status === 'Dispensed' || p.status === 'Collected' ? 'badge-green' : 'badge-amber'}`}>{p.status}</span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <button
                  className="cons-btn primary"
                  disabled={!consultationId}
                  title={consultationId ? undefined : 'Save this consultation as a draft first'}
                  onClick={() => consultationId && navigate(`/prescriptions/new/${consultationId}`)}
                >
                  <PrescriptionIcon /> New Prescription
                </button>
              </div>
            </div>
          )}

          {tab === 'laborders' && (
            <div className="cons-box">
              <div className="cons-box-title">Lab Tests for this Visit</div>
              {labTestOrders.length === 0 && <div className="pat-empty">No lab tests ordered for this consultation yet.</div>}
              {labTestOrders.map((o) => (
                <div key={o.lab_test_order_id} className="cons-rx-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>
                    {o.request_number || `LAB${String(o.lab_test_order_id).padStart(6, '0')}`} — {o.test_name}
                    {o.priority !== 'Routine' && <span className="badge badge-red" style={{ marginLeft: 6 }}>{o.priority}</span>}
                    <span
                      className={`badge ${
                        o.status === 'Completed' ? 'badge-green' : o.status === 'Report Received' ? 'badge-amber' : o.status === 'Cancelled' ? 'badge-red' : 'badge-blue'
                      }`}
                      style={{ marginLeft: 8 }}
                    >
                      {o.status}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 9px' }} onClick={() => printLabTestOrder(o.lab_test_order_id)}>
                      <PrintIcon /> Print Request
                    </button>
                    {o.status === 'Pending' && (
                      <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 9px' }} onClick={() => setReceiveOrder(o)}>
                        Report Received
                      </button>
                    )}
                    {o.status === 'Report Received' && (
                      <button className="pat-btn primary" style={{ fontSize: 11.5, padding: '5px 9px' }} onClick={() => setResultOrder(o)}>
                        Open / Enter Results
                      </button>
                    )}
                    {o.status === 'Completed' && (
                      <>
                        <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 9px' }} onClick={() => setResultOrder(o)}>
                          View Results
                        </button>
                        <button className="pat-btn" style={{ fontSize: 11.5, padding: '5px 9px' }} onClick={() => printLabResultReport(o.lab_test_order_id)}>
                          <PrintIcon /> Print Result
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <button
                  className="cons-btn primary"
                  disabled={!consultationId}
                  title={consultationId ? undefined : 'Save this consultation as a draft first'}
                  onClick={() => setAddLabTestOpen(true)}
                >
                  <ClipboardIcon /> Add Lab Test
                </button>
              </div>
              <p className="pat-muted" style={{ fontSize: 12, marginTop: 10 }}>
                View pending/completed results and doctor review for all of this patient's visits under Patient Search → Lab Results.
              </p>
            </div>
          )}

          {tab === 'followup' && (
            <div className="cons-box">
              <div className="cons-box-title">Follow-up Date</div>
              <input
                type="date"
                className="cons-input"
                style={{ maxWidth: 220 }}
                disabled={!canEdit}
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
              {consultation?.follow_up_date && (
                <p className="pat-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  Currently saved: {formatDate(consultation.follow_up_date)}
                </p>
              )}
              {!isFinalized && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="cons-btn" disabled={!canEdit || saving} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="cons-box">
              <div className="cons-box-title">Past Consultations</div>
              {context.recentConsultations.length === 0 && <div className="pat-empty">No past consultations for this patient.</div>}
              {context.recentConsultations.map((c, i) => (
                <div className="cons-recent-row" key={i}>
                  <span className="cons-recent-diagnosis">{c.diagnosis || 'No diagnosis recorded'}</span>
                  <span className="cons-recent-date">{formatDate(c.date)}</span>
                </div>
              ))}

              {isFinalized && (
                <>
                  <div className="cons-box-title" style={{ marginTop: 20 }}>
                    Amendment History
                  </div>
                  {amendments === null && <div className="pat-empty">Loading…</div>}
                  {amendments !== null && amendments.length === 0 && <div className="pat-empty">No amendments have been made to this record.</div>}
                  {amendments !== null &&
                    amendments.map((a) => (
                      <div className="cons-recent-row" key={a.id} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span className="cons-recent-diagnosis">
                            {AMENDABLE_FIELDS.find((f) => f.field === a.field)?.label ?? a.field}
                          </span>
                          <span className="cons-recent-date">
                            {formatDate(a.amendedAt)}, {formatTime(a.amendedAt)}
                          </span>
                        </div>
                        <span className="pat-muted" style={{ fontSize: 12 }}>
                          "{a.oldValue || '—'}" → "{a.newValue || '—'}"
                        </span>
                        <span className="pat-muted" style={{ fontSize: 12 }}>
                          Reason: {a.reason} — by {a.amendedBy}
                        </span>
                      </div>
                    ))}
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Patient Info</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div className="cons-box-title" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Allergies</span>
                  {canEdit && !editingAllergies && (
                    <button type="button" className="card-link" style={{ fontSize: 11.5 }} onClick={startEditAllergies}>
                      <EditIcon /> {context.patientSummary.allergies ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>
                {editingAllergies ? (
                  <div>
                    <textarea
                      className="cons-textarea"
                      rows={2}
                      value={allergiesDraft}
                      onChange={(e) => setAllergiesDraft(e.target.value)}
                      placeholder="e.g. Penicillin, Sulfa drugs"
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                      <button type="button" className="pat-btn" style={{ fontSize: 11.5, padding: '5px 10px' }} disabled={savingAllergies} onClick={() => setEditingAllergies(false)}>
                        Cancel
                      </button>
                      <button type="button" className="pat-btn primary" style={{ fontSize: 11.5, padding: '5px 10px' }} disabled={savingAllergies} onClick={handleSaveAllergies}>
                        <SaveIcon /> {savingAllergies ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : context.patientSummary.allergies ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: '#b45309' }}>
                    <span style={{ marginTop: 1 }}>
                      <AlertIcon />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{context.patientSummary.allergies}</span>
                  </div>
                ) : (
                  <span className="pat-muted" style={{ fontSize: 12.5 }}>No known allergies recorded.</span>
                )}
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 4 }}>
                  Blood Group
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{context.patientSummary.bloodGroup || '—'}</span>
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 4 }}>
                  Chronic Conditions
                </div>
                {context.patientSummary.chronicConditions.length === 0 ? (
                  <span className="pat-muted" style={{ fontSize: 12.5 }}>None recorded.</span>
                ) : (
                  <div className="cons-chips">
                    {context.patientSummary.chronicConditions.map((c) => (
                      <span className="cons-chip" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="cons-box-title" style={{ marginBottom: 4 }}>
                  Current Medications
                </div>
                {context.patientSummary.currentMedications.length === 0 ? (
                  <span className="pat-muted" style={{ fontSize: 12.5 }}>None recorded.</span>
                ) : (
                  <div className="cons-chips">
                    {context.patientSummary.currentMedications.map((m) => (
                      <span className="cons-chip" key={m}>
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Vital Signs</h3>
              {canEdit && (
                <button className="card-link" onClick={() => setEditingVitals((v) => !v)}>
                  <EditIcon /> {editingVitals ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {!editingVitals && (
              <>
                <div className="cons-vital-stat-grid">
                  {vitalStat('Temperature', form.vitals.temp, '°C', tempWarn)}
                  {vitalStat('Blood Pressure', form.vitals.bp_systolic && form.vitals.bp_diastolic ? `${form.vitals.bp_systolic}/${form.vitals.bp_diastolic}` : '', 'mmHg')}
                  {vitalStat('Heart Rate', form.vitals.pulse, 'bpm')}
                  {vitalStat('Respiratory Rate', form.vitals.respiratory_rate, '/min')}
                  {vitalStat('SpO2', form.vitals.spo2, '%')}
                  {vitalStat('Weight', form.vitals.weight, 'kg')}
                </div>
                {bmi && (
                  <p className="pat-muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                    BMI: <strong style={{ color: '#0f172a' }}>{bmi}</strong>
                  </p>
                )}
              </>
            )}

            {editingVitals && (
              <>
                <div className="cons-vital-edit-grid">
                  <div className="cons-vital-field">
                    <label>Blood Pressure</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <div className="cons-vital-input-wrap">
                        <input type="number" value={form.vitals.bp_systolic} onChange={setVital('bp_systolic')} placeholder="120" />
                      </div>
                      <div className="cons-vital-input-wrap">
                        <input type="number" value={form.vitals.bp_diastolic} onChange={setVital('bp_diastolic')} placeholder="80" />
                        <span className="cons-vital-unit">mmHg</span>
                      </div>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>Heart Rate</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" value={form.vitals.pulse} onChange={setVital('pulse')} />
                      <span className="cons-vital-unit">bpm</span>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>Temperature</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" step="0.1" value={form.vitals.temp} onChange={setVital('temp')} />
                      <span className="cons-vital-unit">°C</span>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>Respiratory Rate</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" value={form.vitals.respiratory_rate} onChange={setVital('respiratory_rate')} />
                      <span className="cons-vital-unit">/min</span>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>SpO2</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" value={form.vitals.spo2} onChange={setVital('spo2')} />
                      <span className="cons-vital-unit">%</span>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>Weight</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" step="0.1" value={form.vitals.weight} onChange={setVital('weight')} />
                      <span className="cons-vital-unit">kg</span>
                    </div>
                  </div>
                  <div className="cons-vital-field">
                    <label>Height</label>
                    <div className="cons-vital-input-wrap">
                      <input type="number" value={form.vitals.height} onChange={setVital('height')} />
                      <span className="cons-vital-unit">cm</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="cons-btn primary" disabled={saving} onClick={handleSaveDraft}>
                    <SaveIcon /> {saving ? 'Saving…' : 'Save Vitals'}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                className="qa-btn"
                disabled={!consultationId}
                title={consultationId ? undefined : 'Save this consultation as a draft first'}
                onClick={() => consultationId && navigate(`/prescriptions/new/${consultationId}`)}
              >
                <span className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PrescriptionIcon />
                </span>
                <span className="qa-label">New Prescription</span>
              </button>
              <button
                className="qa-btn"
                disabled={!consultationId}
                title={consultationId ? undefined : 'Save this consultation as a draft first'}
                onClick={() => {
                  setTab('laborders');
                  setAddLabTestOpen(true);
                }}
              >
                <span className="qa-icon" style={{ background: '#fdf2e9', color: '#c2410c' }}>
                  <ClipboardIcon />
                </span>
                <span className="qa-label">Add Lab Test</span>
              </button>
              <button className="qa-btn" onClick={() => setTab('followup')}>
                <span className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <RefreshIcon />
                </span>
                <span className="qa-label">Issue Follow-up</span>
              </button>
              <button className="qa-btn" onClick={() => window.print()}>
                <span className="qa-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                  <PrintIcon />
                </span>
                <span className="qa-label">Print Consultation</span>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Consultation Summary</h3>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Consultation ID</span>
              <span className="q-summary-value">{consultation ? `CONS-${String(consultation.consultation_id).padStart(6, '0')}` : '—'}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Token No.</span>
              <span className="q-summary-value">{tokenNumber(appointmentId)}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Doctor</span>
              <span className="q-summary-value">Dr. {appointment.doctor.username}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Start Time</span>
              <span className="q-summary-value">{consultation ? formatTime(consultation.created_at) : '—'}</span>
            </div>
            <div className="q-summary-row">
              <span className="q-summary-label">Status</span>
              <span className={`badge ${isFinalized ? 'badge-green' : consultation ? 'badge-amber' : 'badge-gray'}`}>
                {isFinalized ? 'Finalized' : consultation ? 'Draft' : 'Not Started'}
              </span>
            </div>

            {isFinalized && consultationId && (
              <button
                className="pat-btn"
                style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                onClick={() => setShowAmendModal(true)}
              >
                <EditIcon /> Amend Record
              </button>
            )}
          </div>
        </div>
      </div>

      {showAmendModal && consultationId && (
        <AmendModal consultationId={consultationId} currentValues={amendCurrentValues} onClose={() => setShowAmendModal(false)} onAmended={handleAmended} />
      )}

      {addLabTestOpen && consultationId && (
        <AddLabTestModal
          consultationId={consultationId}
          onClose={() => setAddLabTestOpen(false)}
          onAdded={() => {
            setAddLabTestOpen(false);
            reloadLabTestOrders();
          }}
        />
      )}
      {receiveOrder && (
        <MarkReceivedModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onSaved={() => {
            setReceiveOrder(null);
            reloadLabTestOrders();
          }}
        />
      )}
      {resultOrder && (
        <LabResultModal
          orderId={resultOrder.lab_test_order_id}
          onClose={() => setResultOrder(null)}
          onSaved={() => {
            setResultOrder(null);
            reloadLabTestOrders();
          }}
        />
      )}
    </div>
  );
};

export default ConsultationWorkspace;
