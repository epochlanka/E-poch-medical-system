import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { setFamilyHead } from '../../lib/families';
import FamilySearchSelect from './FamilySearchSelect';
import { registerPatient, checkDuplicatePatient, uploadPatientPhoto } from '../../lib/patients';
import type { DuplicateCheckResult } from '../../lib/patients';
import {
  PatientsIcon,
  FamiliesIcon,
  CameraIcon,
  HeartPulseIcon,
  PhoneIcon,
  CheckCircleIcon,
  SaveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UploadIcon,
} from '../../components/layout/Icons';
import {
  BLOOD_GROUP_LETTERS,
  RH_FACTORS,
  MARITAL_STATUSES,
  RELATIONSHIPS_TO_HEAD,
  GENDERS,
  DRAFT_KEY,
  emptyRegisterForm,
  calculateAgeFromDob,
} from './registerPatientUtils';
import type { RegisterFormState } from './registerPatientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import './register.css';

const STEPS = ['Patient Information', 'Contact & Address', 'Medical Information', 'Review & Save'];

const loadDraft = (): RegisterFormState | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyRegisterForm, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
};

const RegisterPatient = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RegisterFormState>(() => loadDraft() ?? emptyRegisterForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Persist a draft (excluding the photo, which isn't worth base64-encoding into localStorage)
  // on every change — same "no server-side draft, use localStorage" pattern used for
  // Prescriptions elsewhere in this app, since Patient creation is atomic (no Draft status).
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const set = <K extends keyof RegisterFormState>(field: K) => (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value as RegisterFormState[K] }));
  };

  const age = calculateAgeFromDob(form.dob);

  const handlePhotoSelect = (file: File | null) => {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleCheckDuplicate = async () => {
    setChecking(true);
    setDuplicateResult(null);
    try {
      const result = form.isMinor
        ? await checkDuplicatePatient({ guardianNic: form.guardianNic, dob: form.dob })
        : await checkDuplicatePatient({ nic: form.idNumber });
      setDuplicateResult(result);
    } catch {
      setDuplicateResult(null);
    } finally {
      setChecking(false);
    }
  };

  const step1Valid =
    form.full_name.trim() &&
    form.dob &&
    form.gender &&
    (form.isMinor ? form.guardianNic.trim() : form.idNumber.trim()) &&
    (form.familyMode === 'new' ? form.newFamilyName.trim() : form.familyId);

  const canProceed = step === 1 ? !!step1Valid : true;

  const goNext = () => setStep((s) => Math.min(4, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    navigate('/patients/all');
  };

  const handleCancel = () => {
    navigate('/patients/all');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const bloodGroup = form.bloodGroupLetter ? `${form.bloodGroupLetter}${form.rhFactor || ''}` : undefined;

      const result = await registerPatient({
        full_name: form.full_name,
        dob: form.dob,
        gender: form.gender,
        nic: !form.isMinor && form.idNumber ? form.idNumber : undefined,
        guardian_nic: form.isMinor && form.guardianNic ? form.guardianNic : undefined,
        phone: form.phone || undefined,
        blood_group: bloodGroup,
        allergies: form.allergies || undefined,
        nationality: form.nationality || undefined,
        marital_status: form.maritalStatus || undefined,
        occupation: form.occupation || undefined,
        employer_school: form.employerSchool || undefined,
        relationship_to_head: form.familyMode === 'existing' ? form.relationshipToHead || undefined : undefined,
        chronic_conditions: form.chronicConditions || undefined,
        current_medications: form.currentMedications || undefined,
        emergency_contact_name: form.emergencyContactName || undefined,
        emergency_contact_phone: form.emergencyContactPhone || undefined,
        family_id: form.familyMode === 'existing' && form.familyId ? Number(form.familyId) : undefined,
        new_family:
          form.familyMode === 'new' ? { family_name: form.newFamilyName, address: form.address || undefined, contact_no: form.contactNo || undefined } : undefined,
      });

      const newPatientId = result.patient.patient_id;

      if (form.familyMode === 'existing' && form.isHeadOfFamily && form.familyId) {
        await setFamilyHead(Number(form.familyId), newPatientId);
      }

      if (photoFile) {
        await uploadPatientPhoto(newPatientId, photoFile);
      }

      localStorage.removeItem(DRAFT_KEY);
      setCreatedId(newPatientId);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(`${err.response.data.message} (existing patient: ${err.response.data.conflictingPatient?.patient_id})`);
      } else if (err.response?.data?.details?.length) {
        setError(err.response.data.details.map((d: any) => d.message).join(', '));
      } else {
        setError(err.response?.data?.message || 'Failed to register patient.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (createdId) {
    return (
      <div className="reg-steps" style={{ flexDirection: 'column', maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div className="modal-success-icon" style={{ margin: '0 auto 14px' }}>
          ✓
        </div>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Patient registered</h2>
        <p style={{ color: '#64748b', margin: '0 0 20px' }}>
          {form.full_name} was saved as <strong>{createdId}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            className="pat-btn"
            onClick={() => {
              setCreatedId(null);
              setForm(emptyRegisterForm);
              setPhotoFile(null);
              setPhotoPreview(null);
              setDuplicateResult(null);
              setStep(1);
            }}
          >
            Register Another
          </button>
          <button className="pat-btn primary" onClick={() => navigate('/patients/all')}>
            Back to All Patients
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Register New Patient</h1>
          <p>Enter patient details. All fields marked with * are required.</p>
        </div>
        <div className="reg-breadcrumb">
          <Link to="/patients/all" style={{ color: '#2563eb', textDecoration: 'none' }}>
            Patients
          </Link>
          <span className="sep">/</span>
          <span className="current">Register New Patient</span>
        </div>
      </div>

      <div className="reg-steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === step ? 'active' : n < step ? 'done' : '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', flex: n < STEPS.length ? 1 : undefined }} key={label}>
              <div className={`reg-step ${state}`}>
                <div className="reg-step-circle">{n < step ? <CheckCircleIcon /> : n}</div>
                <span className="reg-step-label">{label}</span>
              </div>
              {n < STEPS.length && <div className={`reg-step-connector ${n < step ? 'done' : ''}`} />}
            </div>
          );
        })}
      </div>

      {error && <div className="dash-error-banner">{error}</div>}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <PatientsIcon />
                </span>
                <span className="reg-card-title">Basic Information</span>
              </div>
              <div className="reg-grid">
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label>Full Name *</label>
                  <input value={form.full_name} onChange={set('full_name')} placeholder="Enter full name" />
                </div>
                <div className="modal-field">
                  <label>Patient ID</label>
                  <input value="Auto-generated" disabled />
                </div>

                <div className="modal-field">
                  <label>Date of Birth *</label>
                  <input type="date" value={form.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} />
                </div>
                <div className="modal-field">
                  <label>Age</label>
                  <input value={age !== null ? `${age} yrs` : '--'} disabled />
                </div>
                <div className="modal-field">
                  <label>Gender *</label>
                  <select value={form.gender} onChange={set('gender')}>
                    {GENDERS.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="reg-check-row" style={{ gridColumn: 'span 2' }}>
                  <div className="modal-field">
                    <label>{form.isMinor ? 'Guardian NIC *' : 'NIC / Passport / ID *'}</label>
                    <input
                      value={form.isMinor ? form.guardianNic : form.idNumber}
                      onChange={form.isMinor ? set('guardianNic') : set('idNumber')}
                      placeholder={form.isMinor ? "Guardian's National ID" : 'Enter NIC or Passport No.'}
                    />
                  </div>
                  <button
                    type="button"
                    className="reg-check-btn"
                    disabled={checking || (form.isMinor ? !form.guardianNic || !form.dob : !form.idNumber)}
                    onClick={handleCheckDuplicate}
                  >
                    {checking ? 'Checking…' : 'Check'}
                  </button>
                </div>
                <div className="modal-field">
                  <label style={{ visibility: 'hidden' }}>Minor</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, marginTop: 4 }}>
                    <input type="checkbox" checked={form.isMinor} onChange={set('isMinor')} style={{ width: 'auto' }} /> Minor (no own NIC)
                  </label>
                </div>

                {duplicateResult && (
                  <div className={`reg-check-result ${duplicateResult.exists ? 'conflict' : 'ok'}`}>
                    {duplicateResult.exists
                      ? `A patient already exists: ${duplicateResult.patient?.full_name} (${duplicateResult.patient?.patient_id})`
                      : 'No existing patient found — safe to register.'}
                  </div>
                )}

                <div className="modal-field">
                  <label>Nationality</label>
                  <input value={form.nationality} onChange={set('nationality')} placeholder="e.g. Sri Lankan" />
                </div>
                <div className="modal-field">
                  <label>Marital Status</label>
                  <select value={form.maritalStatus} onChange={set('maritalStatus')}>
                    <option value="">Select status</option>
                    {MARITAL_STATUSES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label>Occupation</label>
                  <input value={form.occupation} onChange={set('occupation')} placeholder="Enter occupation" />
                </div>
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label>Employer / School</label>
                  <input value={form.employerSchool} onChange={set('employerSchool')} placeholder="Enter employer or school" />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <FamiliesIcon />
                </span>
                <span className="reg-card-title">Family Information</span>
              </div>
              <div className="reg-grid cols-2">
                <div className="reg-family-toggle">
                  <button type="button" className={form.familyMode === 'existing' ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, familyMode: 'existing' }))}>
                    Add to Existing Family
                  </button>
                  <button type="button" className={form.familyMode === 'new' ? 'active' : ''} onClick={() => setForm((f) => ({ ...f, familyMode: 'new' }))}>
                    + New Family
                  </button>
                </div>

                {form.familyMode === 'existing' ? (
                  <>
                    <div className="modal-field">
                      <label>Add to Family *</label>
                      <FamilySearchSelect
                        selectedId={form.familyId}
                        selectedName={form.familyName}
                        placeholder="Search family by name…"
                        onSelect={(id, name) => setForm((f) => ({ ...f, familyId: id, familyName: name }))}
                        onClear={() => setForm((f) => ({ ...f, familyId: '', familyName: '' }))}
                      />
                    </div>
                    <div className="modal-field">
                      <label>Relationship to Head</label>
                      <select value={form.relationshipToHead} onChange={set('relationshipToHead')}>
                        <option value="">Select relationship</option>
                        {RELATIONSHIPS_TO_HEAD.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div className="reg-checkbox-field">
                      <input type="checkbox" checked={form.isHeadOfFamily} onChange={set('isHeadOfFamily')} />
                      This patient is the Head of Family
                    </div>
                  </>
                ) : (
                  <>
                    <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                      <label>New Family Name *</label>
                      <input value={form.newFamilyName} onChange={set('newFamilyName')} placeholder="e.g. Perera Family" />
                    </div>
                    <div className="reg-checkbox-field">
                      <input type="checkbox" checked disabled />
                      Automatically the Head of Family (first member)
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <CameraIcon />
                </span>
                <span className="reg-card-title">Identification & Photo</span>
              </div>
              <div className="reg-grid cols-2">
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Patient Photo</label>
                  <div
                    className={`reg-upload-box${photoPreview ? ' has-image' : ''}`}
                    onClick={() => photoInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handlePhotoSelect(file);
                    }}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Patient" />
                    ) : (
                      <>
                        <span className="reg-upload-icon">
                          <CameraIcon />
                        </span>
                        <span className="reg-upload-title">Click to capture photo</span>
                        <span className="reg-upload-sub">or drag and drop · JPG, PNG (Max 2MB)</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>ID Document</label>
                  <div className="reg-upload-box" style={{ cursor: 'not-allowed', opacity: 0.6 }}>
                    <span className="reg-upload-icon">
                      <UploadIcon />
                    </span>
                    <span className="reg-upload-title">Coming soon</span>
                    <span className="reg-upload-sub">ID document scanning isn't available yet</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
      )}
      {step === 2 && (
        <div className="card">
          <div className="reg-card-header">
            <span className="reg-card-icon">
              <PhoneIcon />
            </span>
            <span className="reg-card-title">Contact & Address</span>
          </div>
          <div className="reg-grid cols-2">
            <div className="modal-field">
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="07X XXXXXXX" />
            </div>
            <div />
            <div className="modal-field">
              <label>Emergency Contact Name</label>
              <input value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" />
            </div>
            <div className="modal-field">
              <label>Emergency Contact Phone</label>
              <input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="07X XXXXXXX" />
            </div>

            {form.familyMode === 'new' ? (
              <>
                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label>Household Address</label>
                  <input value={form.address} onChange={set('address')} placeholder="e.g. 12 Galle Road, Colombo" />
                </div>
                <div className="modal-field">
                  <label>Household Contact No.</label>
                  <input value={form.contactNo} onChange={set('contactNo')} placeholder="07X XXXXXXX" />
                </div>
              </>
            ) : (
              <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>
                  Household address is managed on the Family Directory page since this patient is joining an existing family.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="reg-card-header">
            <span className="reg-card-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <HeartPulseIcon />
            </span>
            <span className="reg-card-title">Medical Information</span>
          </div>
          <div className="reg-grid cols-2">
            <div className="modal-field">
              <label>Blood Group</label>
              <select value={form.bloodGroupLetter} onChange={set('bloodGroupLetter')}>
                <option value="">Select blood group</option>
                {BLOOD_GROUP_LETTERS.map((bg) => (
                  <option key={bg}>{bg}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>RH Factor</label>
              <select value={form.rhFactor} onChange={set('rhFactor')}>
                <option value="">Select RH factor</option>
                {RH_FACTORS.map((rh) => (
                  <option key={rh.value} value={rh.value}>
                    {rh.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label>Allergies</label>
              <textarea rows={3} value={form.allergies} onChange={set('allergies')} placeholder="Enter any known allergies" maxLength={200} />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label>Chronic Conditions</label>
              <textarea rows={3} value={form.chronicConditions} onChange={set('chronicConditions')} placeholder="Enter any chronic conditions" maxLength={200} />
            </div>
            <div className="modal-field" style={{ gridColumn: 'span 2' }}>
              <label>Current Medications</label>
              <textarea
                rows={3}
                value={form.currentMedications}
                onChange={set('currentMedications')}
                placeholder="Enter current medications (if any)"
                maxLength={200}
              />
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <div className="reg-card-header">
            <span className="reg-card-icon">
              <CheckCircleIcon />
            </span>
            <span className="reg-card-title">Review & Save</span>
          </div>

          <div className="reg-review-section">
            <h4>Basic Information</h4>
            <div className="reg-review-grid">
              <div className="reg-review-field">
                <span className="reg-review-label">Full Name</span>
                <span className="reg-review-value">{form.full_name || '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Date of Birth</span>
                <span className="reg-review-value">
                  {form.dob || '—'} {age !== null && `(${age} yrs)`}
                </span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Gender</span>
                <span className="reg-review-value">{form.gender}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">{form.isMinor ? 'Guardian NIC' : 'NIC / Passport'}</span>
                <span className="reg-review-value">{(form.isMinor ? form.guardianNic : form.idNumber) || '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Nationality</span>
                <span className="reg-review-value">{form.nationality || '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Marital Status</span>
                <span className="reg-review-value">{form.maritalStatus || '—'}</span>
              </div>
            </div>
          </div>

          <div className="reg-review-section">
            <h4>Family</h4>
            <div className="reg-review-grid">
              <div className="reg-review-field">
                <span className="reg-review-label">Family</span>
                <span className="reg-review-value">
                  {form.familyMode === 'new' ? `${form.newFamilyName || '—'} (new)` : form.familyName || '—'}
                </span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Relationship to Head</span>
                <span className="reg-review-value">{form.familyMode === 'new' ? 'Head of Family' : form.relationshipToHead || '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Head of Family</span>
                <span className="reg-review-value">{form.familyMode === 'new' || form.isHeadOfFamily ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          <div className="reg-review-section">
            <h4>Contact & Address</h4>
            <div className="reg-review-grid">
              <div className="reg-review-field">
                <span className="reg-review-label">Phone</span>
                <span className="reg-review-value">{form.phone || '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Emergency Contact</span>
                <span className="reg-review-value">
                  {form.emergencyContactName ? `${form.emergencyContactName} (${form.emergencyContactPhone || '—'})` : '—'}
                </span>
              </div>
              {form.familyMode === 'new' && (
                <div className="reg-review-field">
                  <span className="reg-review-label">Household Address</span>
                  <span className="reg-review-value">{form.address || '—'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="reg-review-section">
            <h4>Medical Information</h4>
            <div className="reg-review-grid">
              <div className="reg-review-field">
                <span className="reg-review-label">Blood Group</span>
                <span className="reg-review-value">{form.bloodGroupLetter ? `${form.bloodGroupLetter}${form.rhFactor}` : '—'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Allergies</span>
                <span className="reg-review-value">{form.allergies || 'None recorded'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Chronic Conditions</span>
                <span className="reg-review-value">{form.chronicConditions || 'None recorded'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Current Medications</span>
                <span className="reg-review-value">{form.currentMedications || 'None recorded'}</span>
              </div>
              <div className="reg-review-field">
                <span className="reg-review-label">Photo</span>
                <span className="reg-review-value">{photoPreview ? 'Attached' : 'Not attached'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="reg-footer">
        <button className="pat-btn" onClick={handleCancel} disabled={submitting}>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pat-btn" onClick={handleSaveDraft} disabled={submitting}>
            <SaveIcon /> Save as Draft
          </button>
          {step > 1 && (
            <button className="pat-btn" onClick={goBack} disabled={submitting}>
              <ChevronLeftIcon /> Back
            </button>
          )}
          {step < 4 ? (
            <button className="pat-btn primary" onClick={goNext} disabled={!canProceed}>
              Next: {STEPS[step]} <ChevronRightIcon />
            </button>
          ) : (
            <button className="pat-btn primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Registering…' : 'Register Patient'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterPatient;
