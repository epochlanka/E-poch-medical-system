import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { PlusIcon, TrashIcon, AlertIcon } from '../../components/layout/Icons';
import type { ConsultationDocument } from '../../lib/consultations';
import type { DiagnosisEntry } from './consultationUtils';
import AttachFiles from './AttachFiles';

export interface ConsultationFormState {
  complaint: string;
  history_of_present_illness: string;
  examination_findings: string;
  medical_history: string[];
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
  diagnosisList: DiagnosisEntry[];
}

const bmiCategory = (bmi: number) => {
  if (bmi < 18.5) return { label: 'Underweight', color: '#b45309', bg: '#fef3c7' };
  if (bmi < 25) return { label: 'Normal', color: '#15803d', bg: '#dcfce7' };
  if (bmi < 30) return { label: 'Overweight', color: '#b45309', bg: '#fef3c7' };
  return { label: 'Obese', color: '#b91c1c', bg: '#fee2e2' };
};

interface ConsultationTabProps {
  form: ConsultationFormState;
  setForm: React.Dispatch<React.SetStateAction<ConsultationFormState>>;
  disabled: boolean;
  patientAllergies: string | null;
  medicalConditionOptions: string[];
  documents: ConsultationDocument[];
  onUploadFile: (file: File) => Promise<void>;
  onDeleteFile: (documentId: number) => Promise<void>;
  uploading: boolean;
}

const ConsultationTab = ({
  form,
  setForm,
  disabled,
  patientAllergies,
  medicalConditionOptions,
  documents,
  onUploadFile,
  onDeleteFile,
  uploading,
}: ConsultationTabProps) => {
  const [conditionToAdd, setConditionToAdd] = useState('');
  const [diagnosisDraft, setDiagnosisDraft] = useState({ code: '', description: '' });

  const setField = (field: keyof ConsultationFormState) => (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const setVital = (field: keyof ConsultationFormState['vitals']) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, vitals: { ...f.vitals, [field]: e.target.value } }));

  const weight = parseFloat(form.vitals.weight);
  const height = parseFloat(form.vitals.height);
  const bmi = weight > 0 && height > 0 ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null;

  const addCondition = () => {
    if (!conditionToAdd || form.medical_history.includes(conditionToAdd)) return;
    setForm((f) => ({ ...f, medical_history: [...f.medical_history, conditionToAdd] }));
    setConditionToAdd('');
  };
  const removeCondition = (c: string) => setForm((f) => ({ ...f, medical_history: f.medical_history.filter((x) => x !== c) }));

  const addDiagnosis = () => {
    if (!diagnosisDraft.description.trim()) return;
    setForm((f) => ({ ...f, diagnosisList: [...f.diagnosisList, diagnosisDraft] }));
    setDiagnosisDraft({ code: '', description: '' });
  };
  const removeDiagnosis = (i: number) => setForm((f) => ({ ...f, diagnosisList: f.diagnosisList.filter((_, idx) => idx !== i) }));

  return (
    <div className="cons-main">
      {patientAllergies && (
        <div className="cons-box span-2" style={{ background: '#fffbeb', borderColor: '#fde68a', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#b45309' }}>
            <AlertIcon />
          </span>
          <span style={{ fontSize: 13, color: '#92400e', flex: 1 }}>
            Known allergies: <strong>{patientAllergies}</strong>
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
            <input type="checkbox" checked={form.allergies_ack} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, allergies_ack: e.target.checked }))} />
            Reviewed
          </label>
        </div>
      )}

      <div className="cons-box span-2">
        <div className="cons-box-title">Chief Complaint</div>
        <textarea
          className="cons-textarea"
          rows={2}
          disabled={disabled}
          value={form.complaint}
          onChange={setField('complaint')}
          placeholder="Enter patient's chief complaint..."
        />
      </div>

      <div className="cons-box">
        <div className="cons-box-title">History of Present Illness</div>
        <textarea
          className="cons-textarea"
          rows={4}
          disabled={disabled}
          value={form.history_of_present_illness}
          onChange={setField('history_of_present_illness')}
          placeholder="Enter history of present illness..."
        />
      </div>

      <div className="cons-box">
        <div className="cons-box-title">Vital Signs</div>
        <div className="cons-vitals-grid">
          <div className="cons-vital-field">
            <label>Blood Pressure</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="cons-vital-input-wrap">
                <input type="number" disabled={disabled} value={form.vitals.bp_systolic} onChange={setVital('bp_systolic')} placeholder="120" />
              </div>
              <div className="cons-vital-input-wrap">
                <input type="number" disabled={disabled} value={form.vitals.bp_diastolic} onChange={setVital('bp_diastolic')} placeholder="80" />
                <span className="cons-vital-unit">mmHg</span>
              </div>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>Heart Rate</label>
            <div className="cons-vital-input-wrap">
              <input type="number" disabled={disabled} value={form.vitals.pulse} onChange={setVital('pulse')} />
              <span className="cons-vital-unit">bpm</span>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>Temperature</label>
            <div className="cons-vital-input-wrap">
              <input type="number" step="0.1" disabled={disabled} value={form.vitals.temp} onChange={setVital('temp')} />
              <span className="cons-vital-unit">°C</span>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>Respiratory Rate</label>
            <div className="cons-vital-input-wrap">
              <input type="number" disabled={disabled} value={form.vitals.respiratory_rate} onChange={setVital('respiratory_rate')} />
              <span className="cons-vital-unit">/min</span>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>SpO2</label>
            <div className="cons-vital-input-wrap">
              <input type="number" disabled={disabled} value={form.vitals.spo2} onChange={setVital('spo2')} />
              <span className="cons-vital-unit">%</span>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>Weight</label>
            <div className="cons-vital-input-wrap">
              <input type="number" step="0.1" disabled={disabled} value={form.vitals.weight} onChange={setVital('weight')} />
              <span className="cons-vital-unit">kg</span>
            </div>
          </div>
          <div className="cons-vital-field">
            <label>Height</label>
            <div className="cons-vital-input-wrap">
              <input type="number" disabled={disabled} value={form.vitals.height} onChange={setVital('height')} />
              <span className="cons-vital-unit">cm</span>
            </div>
          </div>
          <div className="cons-vital-field" style={{ gridColumn: 'span 2' }}>
            <label>BMI</label>
            <div className="cons-bmi-value">
              {bmi ?? '—'}
              {bmi && (
                <span className="badge" style={{ background: bmiCategory(bmi).bg, color: bmiCategory(bmi).color }}>
                  {bmiCategory(bmi).label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="cons-box">
        <div className="cons-box-title">Medical History</div>
        <div className="cons-chip-row">
          <select className="cons-select" disabled={disabled} value={conditionToAdd} onChange={(e) => setConditionToAdd(e.target.value)}>
            <option value="">Select condition</option>
            {medicalConditionOptions
              .filter((c) => !form.medical_history.includes(c))
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <button type="button" className="cons-btn primary" disabled={disabled || !conditionToAdd} onClick={addCondition}>
            <PlusIcon /> Add
          </button>
        </div>
        <div className="cons-chips">
          {form.medical_history.map((c) => (
            <span className="cons-chip" key={c}>
              {c}
              {!disabled && (
                <button type="button" onClick={() => removeCondition(c)} aria-label={`Remove ${c}`}>
                  ×
                </button>
              )}
            </span>
          ))}
          {form.medical_history.length === 0 && <span className="fam-muted" style={{ fontSize: 12.5 }}>No conditions tagged for this visit.</span>}
        </div>
      </div>

      <div className="cons-box">
        <div className="cons-box-title">Examination</div>
        <textarea
          className="cons-textarea"
          rows={5}
          disabled={disabled}
          value={form.examination_findings}
          onChange={setField('examination_findings')}
          placeholder="Enter examination findings..."
        />
      </div>

      <div className="cons-box span-2">
        <div className="cons-box-title">Diagnosis</div>
        <div className="cons-chip-row">
          <input
            className="cons-input"
            style={{ maxWidth: 140 }}
            disabled={disabled}
            placeholder="ICD-10 code"
            value={diagnosisDraft.code}
            onChange={(e) => setDiagnosisDraft((d) => ({ ...d, code: e.target.value }))}
          />
          <input
            className="cons-input"
            disabled={disabled}
            placeholder="Diagnosis description"
            value={diagnosisDraft.description}
            onChange={(e) => setDiagnosisDraft((d) => ({ ...d, description: e.target.value }))}
          />
          <button type="button" className="cons-btn primary" disabled={disabled || !diagnosisDraft.description.trim()} onClick={addDiagnosis}>
            <PlusIcon /> Add
          </button>
        </div>
        {form.diagnosisList.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="cons-box-title" style={{ fontSize: 12 }}>
              Added Diagnoses
            </div>
            {form.diagnosisList.map((d, i) => (
              <div className="cons-diagnosis-row" key={i}>
                <span>
                  {d.code && <span className="cons-diagnosis-code">{d.code}</span>}
                  {d.description}
                </span>
                {!disabled && (
                  <button type="button" onClick={() => removeDiagnosis(i)} aria-label="Remove diagnosis">
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cons-box span-2">
        <div className="cons-box-title">Treatment Plan / Notes</div>
        <textarea
          className="cons-textarea"
          rows={5}
          disabled={disabled}
          value={form.notes}
          onChange={setField('notes')}
          placeholder="Enter treatment plan or notes..."
        />
      </div>

      <div className="cons-box span-2">
        <div className="cons-box-title">Attach Files</div>
        <AttachFiles documents={documents} disabled={disabled} uploading={uploading} onUploadFile={onUploadFile} onDeleteFile={onDeleteFile} />
      </div>
    </div>
  );
};

export default ConsultationTab;
