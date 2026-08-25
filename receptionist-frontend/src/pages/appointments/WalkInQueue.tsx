import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { getDoctors, createAppointment, getLiveQueue, getQueueStats, displayPatientName } from '../../lib/appointments';
import type { Doctor, QueueAppointment } from '../../lib/appointments';
import { getClinicSettings } from '../../lib/settings';
import {
  UsersIcon,
  InfoIcon,
  AlertIcon,
  SearchIcon,
  SaveIcon,
  CheckCircleIcon,
  UserPlusIcon,
  StethoscopeIcon,
  ClockIcon,
  RefreshIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import NewPatientModal from '../patients/NewPatientModal';
import { initials, calculateAge, formatDate } from '../patients/patientUtils';
import { CONSULTATION_TYPES } from './appointmentUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './bookAppointment.css';
import './walkIn.css';

const DRAFT_KEY = 'epoch_reception_walkin_draft';

type Priority = 'Normal' | 'Urgent' | 'Emergency';

// Minimal capture for "Continue Without Registration" — deliberately just enough for today's
// visit (FR-026 extension). Kept as strings while editing; parsed/trimmed at submit time.
interface TempPatientDraft {
  name: string;
  gender: string;
  age: string;
  phone: string;
}

const emptyTempPatient: TempPatientDraft = { name: '', gender: '', age: '', phone: '' };

interface WalkInState {
  patientMode: 'existing' | 'new';
  // Which of the two "New Patient" options is active — 'choose' shows both option cards,
  // 'temporary' expands the minimal capture form. 'register' has no distinct UI state since it
  // just opens the existing NewPatientModal (success flips patientMode back to 'existing').
  newPatientStep: 'choose' | 'temporary';
  patient: Patient | null;
  tempPatient: TempPatientDraft | null;
  doctor: Doctor | null;
  consultationType: string;
  visitType: 'Appointment' | 'Follow-up';
  priority: Priority;
  reason: string;
  notes: string;
}

const emptyWalkIn: WalkInState = {
  patientMode: 'existing',
  newPatientStep: 'choose',
  patient: null,
  tempPatient: null,
  doctor: null,
  consultationType: CONSULTATION_TYPES[0],
  visitType: 'Appointment',
  priority: 'Normal',
  reason: '',
  notes: '',
};

const loadDraft = (): WalkInState | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyWalkIn, ...JSON.parse(raw), patient: null, tempPatient: null, newPatientStep: 'choose' } : null;
  } catch {
    return null;
  }
};

const PRIORITIES: { value: Priority; label: string; sub: string; cls: string }[] = [
  { value: 'Normal', label: 'Normal', sub: 'Normal: Regular visit', cls: 'normal' },
  { value: 'Urgent', label: 'Urgent', sub: 'Urgent: Needs early attention', cls: 'urgent' },
  { value: 'Emergency', label: 'Emergency', sub: 'Emergency: Immediate attention', cls: 'emergency' },
];

const WalkInQueue = () => {
  const navigate = useNavigate();
  const [walkIn, setWalkIn] = useState<WalkInState>(() => loadDraft() ?? emptyWalkIn);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ appointment_id: number } | null>(null);
  const doctorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(walkIn));
  }, [walkIn]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (doctorRef.current && !doctorRef.current.contains(e.target as Node)) setDoctorDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (doctorSearch.trim().length < 1) {
      setDoctorResults([]);
      return;
    }
    setDoctorSearching(true);
    const t = setTimeout(() => {
      getDoctors(doctorSearch)
        .then(setDoctorResults)
        .finally(() => setDoctorSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [doctorSearch]);

  // Debounced search; below 2 characters, fall back to the most recently registered active
  // patients so the "Recent / Matched Patients" list is never empty on first load.
  const { data: recentPatients } = useApiData(() => listPatients({ status: 'active', limit: 4 }).then((r) => r.data), []);
  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      listPatients({ search: searchInput, status: 'active', limit: 6 })
        .then((res) => setSearchResults(res.data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: clinic } = useApiData(() => getClinicSettings(), []);
  const { data: queueStats, reload: reloadStats } = useApiData(() => getQueueStats(), []);
  const { data: liveQueue, reload: reloadQueue } = useApiData(() => getLiveQueue(), []);

  const displayedPatients = searchInput.trim().length >= 2 ? searchResults : recentPatients ?? [];

  const selectPatient = (patient: Patient) => {
    setWalkIn((w) => ({ ...w, patient }));
  };

  const tempPatientValid = !!walkIn.tempPatient?.name.trim();
  const canSubmit = (!!walkIn.patient || tempPatientValid) && !!walkIn.doctor && !!walkIn.consultationType;

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(walkIn));
    navigate('/dashboard');
  };

  const handleSubmit = async () => {
    if ((!walkIn.patient && !tempPatientValid) || !walkIn.doctor) return;
    setSubmitting(true);
    setError(null);
    try {
      const result: any = await createAppointment({
        ...(walkIn.patient
          ? { patient_id: walkIn.patient.patient_id }
          : {
              is_temporary: true,
              temp_patient_name: walkIn.tempPatient!.name.trim(),
              temp_patient_gender: walkIn.tempPatient!.gender || undefined,
              temp_patient_phone: walkIn.tempPatient!.phone.trim() || undefined,
              temp_patient_age: walkIn.tempPatient!.age ? Number(walkIn.tempPatient!.age) : undefined,
            }),
        doctor_id: walkIn.doctor.user_id,
        scheduled_at: new Date().toISOString(),
        reason: walkIn.reason || undefined,
        notes: walkIn.notes || undefined,
        is_walk_in: true,
        consultation_type: walkIn.consultationType || undefined,
        visit_type: walkIn.visitType,
        priority: walkIn.priority,
      });
      localStorage.removeItem(DRAFT_KEY);
      setCreated({ appointment_id: result.appointment_id });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add patient to the queue.');
    } finally {
      setSubmitting(false);
    }
  };

  // Next-5 preview: real queue is scheduled_at-ascending, so a patient's position in it IS
  // their token order — same "derive a display code from real stable ordering" convention used
  // elsewhere in this app (e.g. doctor-frontend's T-0xx token, Skip/Recall's queue position).
  const queue = liveQueue ?? [];
  const previewToken = queue.length + 1;
  const upcomingReal = queue.slice(Math.max(0, queue.length - 4));

  const totalInQueue = queueStats ? queueStats.waitingCount + queueStats.calledCount + queueStats.inConsultation : 0;

  if (created) {
    const addedName = walkIn.patient?.full_name ?? walkIn.tempPatient?.name;
    return (
      <div className="reg-steps" style={{ flexDirection: 'column', maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div className="modal-success-icon" style={{ margin: '0 auto 14px' }}>
          ✓
        </div>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Added to the queue</h2>
        <p style={{ color: '#64748b', margin: '0 0 12px' }}>
          {addedName} is now token #{previewToken} in Dr. {walkIn.doctor?.username}'s queue.
        </p>
        {!walkIn.patient && (
          <span className="wi-temp-badge" style={{ margin: '0 0 20px', display: 'inline-flex' }}>
            Temporary / Unregistered — Today Only
          </span>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: walkIn.patient ? 0 : 8 }}>
          <button
            className="pat-btn"
            onClick={() => {
              setCreated(null);
              setWalkIn(emptyWalkIn);
              setSearchInput('');
              reloadStats();
              reloadQueue();
            }}
          >
            Add Another
          </button>
          <button className="pat-btn primary" onClick={() => navigate('/queue/live')}>
            View Live Queue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <UsersIcon />
            </span>
            Walk-in / Add to Queue
          </h1>
          <p>Register a walk-in patient and add to the live queue.</p>
        </div>
        <div className="reg-breadcrumb">
          <span>Appointments &amp; Queue</span>
          <span className="sep">/</span>
          <span className="current">Walk-in / Add to Queue</span>
        </div>
      </div>

      <div className="wi-banner">
        <InfoIcon />
        Walk-in patients will be added to the queue in the order you select.
      </div>

      {error && <div className="dash-error-banner">{error}</div>}

      <div className="bk-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="reg-card-header">
              <span className="reg-card-icon">
                <UsersIcon />
              </span>
              <span className="reg-card-title">1. Select Patient</span>
            </div>

            <div className="bk-toggle">
              <label>
                <input
                  type="radio"
                  checked={walkIn.patientMode === 'existing'}
                  onChange={() => setWalkIn((w) => ({ ...w, patientMode: 'existing', tempPatient: null, newPatientStep: 'choose' }))}
                />
                Existing Patient
              </label>
              <label>
                <input
                  type="radio"
                  checked={walkIn.patientMode === 'new'}
                  onChange={() => setWalkIn((w) => ({ ...w, patientMode: 'new', patient: null }))}
                />
                New Patient
              </label>
            </div>

            {walkIn.patientMode === 'existing' ? (
              <>
                <div className="pat-search">
                  <SearchIcon />
                  <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
                </div>

                <div className="wi-patient-list">
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    {searchInput.trim().length >= 2 ? 'Search Results' : 'Recent / Matched Patients'}
                  </div>
                  {searching && <div className="wi-list-empty">Searching…</div>}
                  {!searching && displayedPatients.length === 0 && <div className="wi-list-empty">No patients found.</div>}
                  {!searching &&
                    displayedPatients.map((p) => (
                      <div key={p.patient_id} className={`wi-patient-row${walkIn.patient?.patient_id === p.patient_id ? ' selected' : ''}`} onClick={() => selectPatient(p)}>
                        {walkIn.patient?.patient_id === p.patient_id && (
                          <span className="wi-patient-check">
                            <CheckCircleIcon />
                          </span>
                        )}
                        {p.photo_url ? <img className="pat-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pat-avatar">{initials(p.full_name)}</div>}
                        <div className="wi-patient-info">
                          <div className="pat-name">
                            {p.full_name} <span className="badge badge-blue">{p.patient_id}</span>
                          </div>
                          <div className="wi-patient-sub">
                            NIC: {p.nic || p.guardian_nic || '—'} · {formatDate(p.dob)} ({calculateAge(p.dob)} Y)
                          </div>
                          <div className="wi-patient-sub">Phone: {p.phone || '—'}</div>
                        </div>
                      </div>
                    ))}
                  <Link to="/patients/all" className="wi-view-all">
                    <UsersIcon /> View all patients
                  </Link>
                </div>
              </>
            ) : walkIn.newPatientStep === 'temporary' ? (
              <div className="wi-temp-form">
                <button
                  type="button"
                  className="wi-temp-form-back"
                  onClick={() => setWalkIn((w) => ({ ...w, newPatientStep: 'choose', tempPatient: null }))}
                >
                  ← Back to options
                </button>
                <div className="wi-banner" style={{ marginTop: 8 }}>
                  <InfoIcon /> Only a name is required. This patient won't get a permanent record — they'll be added to today's queue only.
                </div>
                <div className="reg-grid cols-2" style={{ marginTop: 10 }}>
                  <div className="modal-field span-2">
                    <label>Patient Name *</label>
                    <input
                      autoFocus
                      value={walkIn.tempPatient?.name ?? ''}
                      onChange={(e) => setWalkIn((w) => ({ ...w, tempPatient: { ...(w.tempPatient ?? emptyTempPatient), name: e.target.value } }))}
                      placeholder="Enter patient's name…"
                    />
                  </div>
                  <div className="modal-field">
                    <label>Age (Optional)</label>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      value={walkIn.tempPatient?.age ?? ''}
                      onChange={(e) => setWalkIn((w) => ({ ...w, tempPatient: { ...(w.tempPatient ?? emptyTempPatient), age: e.target.value } }))}
                      placeholder="e.g. 34"
                    />
                  </div>
                  <div className="modal-field">
                    <label>Gender (Optional)</label>
                    <select
                      value={walkIn.tempPatient?.gender ?? ''}
                      onChange={(e) => setWalkIn((w) => ({ ...w, tempPatient: { ...(w.tempPatient ?? emptyTempPatient), gender: e.target.value } }))}
                    >
                      <option value="">Not specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="modal-field span-2">
                    <label>Phone (Optional)</label>
                    <input
                      value={walkIn.tempPatient?.phone ?? ''}
                      onChange={(e) => setWalkIn((w) => ({ ...w, tempPatient: { ...(w.tempPatient ?? emptyTempPatient), phone: e.target.value } }))}
                      placeholder="Contact number for today, if available"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="wi-new-patient-options">
                <button type="button" className="wi-option-card primary" onClick={() => setShowNewPatient(true)}>
                  <span className="wi-option-icon">
                    <UserPlusIcon />
                  </span>
                  <span className="wi-option-body">
                    <span className="wi-option-title">Register New Patient</span>
                    <span className="wi-option-sub">Create a patient record for future visits.</span>
                  </span>
                  <ChevronRightIcon />
                </button>
                <button
                  type="button"
                  className="wi-option-card secondary"
                  onClick={() => setWalkIn((w) => ({ ...w, newPatientStep: 'temporary', tempPatient: emptyTempPatient }))}
                >
                  <span className="wi-option-icon">
                    <ClockIcon />
                  </span>
                  <span className="wi-option-body">
                    <span className="wi-option-title">Continue Without Registration</span>
                    <span className="wi-option-sub">Add this patient to today's queue only.</span>
                  </span>
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="reg-card-header">
              <span className="reg-card-icon">
                <ClockIcon />
              </span>
              <span className="reg-card-title">2. Queue Details</span>
            </div>

            <div className="reg-grid cols-2">
              <div className="modal-field">
                <label>Doctor / Consultant *</label>
                <div className="bk-doctor-select" ref={doctorRef}>
                  {walkIn.doctor && !doctorDropdownOpen ? (
                    <button
                      type="button"
                      className="bk-doctor-btn"
                      onClick={() => {
                        setDoctorDropdownOpen(true);
                        setDoctorSearch(walkIn.doctor!.username);
                      }}
                    >
                      <div className="pat-avatar" style={{ width: 32, height: 32 }}>
                        {initials(walkIn.doctor.username)}
                      </div>
                      <div>
                        <div className="bk-doctor-name">Dr. {walkIn.doctor.username}</div>
                        <div className="bk-doctor-sub">{walkIn.doctor.registration_number ? `Reg: ${walkIn.doctor.registration_number}` : ''}</div>
                      </div>
                    </button>
                  ) : (
                    <div className="pat-search" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                      <SearchIcon />
                      <input
                        placeholder="Search doctor by name…"
                        value={doctorSearch}
                        onFocus={() => setDoctorDropdownOpen(true)}
                        onChange={(e) => {
                          setDoctorSearch(e.target.value);
                          setDoctorDropdownOpen(true);
                        }}
                      />
                    </div>
                  )}
                  {doctorDropdownOpen && (
                    <div className="bk-doctor-dropdown">
                      {doctorSearching && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Searching…</div>}
                      {!doctorSearching && doctorSearch.trim().length < 1 && (
                        <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Type a doctor's name to search…</div>
                      )}
                      {!doctorSearching && doctorSearch.trim().length >= 1 && doctorResults.length === 0 && (
                        <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>No doctors found.</div>
                      )}
                      {!doctorSearching &&
                        doctorResults.map((doc) => (
                          <div
                            key={doc.user_id}
                            className="bk-doctor-option"
                            onClick={() => {
                              setWalkIn((w) => ({ ...w, doctor: doc }));
                              setDoctorDropdownOpen(false);
                              setDoctorSearch('');
                            }}
                          >
                            <div className="pat-avatar" style={{ width: 32, height: 32 }}>
                              {initials(doc.username)}
                            </div>
                            <div>
                              <div className="bk-doctor-name">Dr. {doc.username}</div>
                              <div className="bk-doctor-sub">{doc.registration_number ? `Reg: ${doc.registration_number}` : 'No registration number on file'}</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-field">
                <label>Consultation Type *</label>
                <select value={walkIn.consultationType} onChange={(e) => setWalkIn((w) => ({ ...w, consultationType: e.target.value }))}>
                  {CONSULTATION_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label>Branch / Location *</label>
                <input value={clinic?.clinic_name ?? 'Loading…'} disabled />
              </div>

              <div className="modal-field">
                <label>Visit Type *</label>
                <div className="bk-visit-toggle">
                  <button
                    type="button"
                    className={`bk-visit-btn${walkIn.visitType === 'Appointment' ? ' active' : ''}`}
                    onClick={() => setWalkIn((w) => ({ ...w, visitType: 'Appointment' }))}
                  >
                    <UserPlusIcon /> Walk-in
                  </button>
                  <button
                    type="button"
                    className={`bk-visit-btn${walkIn.visitType === 'Follow-up' ? ' active' : ''}`}
                    onClick={() => setWalkIn((w) => ({ ...w, visitType: 'Follow-up' }))}
                  >
                    <RefreshIcon /> Follow-up
                  </button>
                </div>
              </div>

              <div className="modal-field span-2">
                <label>Priority *</label>
                <div className="wi-priority-grid">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`wi-priority-btn ${p.cls}${walkIn.priority === p.value ? ' active' : ''}`}
                      onClick={() => setWalkIn((w) => ({ ...w, priority: p.value }))}
                    >
                      <div className="wi-priority-btn-top">
                        <AlertIcon /> {p.label}
                      </div>
                      <div className="wi-priority-btn-sub">{p.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-field span-2">
                <label>Reason for Visit (Optional)</label>
                <textarea
                  rows={3}
                  maxLength={200}
                  value={walkIn.reason}
                  onChange={(e) => setWalkIn((w) => ({ ...w, reason: e.target.value }))}
                  placeholder="Enter brief reason for visit…"
                />
                <span className="pat-muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>
                  {walkIn.reason.length} / 200
                </span>
              </div>

              <div className="modal-field span-2">
                <label>Notes (Optional)</label>
                <textarea rows={3} maxLength={200} value={walkIn.notes} onChange={(e) => setWalkIn((w) => ({ ...w, notes: e.target.value }))} placeholder="Add any notes…" />
                <span className="pat-muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>
                  {walkIn.notes.length} / 200
                </span>
              </div>
            </div>

            <div className="wi-confirm-banner">
              <CheckCircleIcon /> Patient will be added to the queue with the next available token.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
                  <UsersIcon />
                </span>
                Current Queue Summary
              </h3>
              <button className="card-link" onClick={reloadStats} title="Refresh">
                <RefreshIcon />
              </button>
            </div>
            <div className="wi-summary-grid">
              <div className="wi-summary-item total">
                <span className="wi-summary-icon">
                  <UsersIcon />
                </span>
                <div>
                  <div className="wi-summary-label">Total in Queue</div>
                  <div className="wi-summary-value">{totalInQueue}</div>
                </div>
              </div>
              <div className="wi-summary-item waiting">
                <span className="wi-summary-icon">
                  <ClockIcon />
                </span>
                <div>
                  <div className="wi-summary-label">Waiting</div>
                  <div className="wi-summary-value">{queueStats?.waitingCount ?? 0}</div>
                </div>
              </div>
              <div className="wi-summary-item doctor">
                <span className="wi-summary-icon">
                  <StethoscopeIcon />
                </span>
                <div>
                  <div className="wi-summary-label">With Doctor</div>
                  <div className="wi-summary-value">{queueStats?.inConsultation ?? 0}</div>
                </div>
              </div>
              <div className="wi-summary-item completed">
                <span className="wi-summary-icon">
                  <CheckCircleIcon />
                </span>
                <div>
                  <div className="wi-summary-label">Completed Today</div>
                  <div className="wi-summary-value">{queueStats?.completedToday ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Next in Queue {walkIn.patient || tempPatientValid ? '(After Addition)' : ''}</h3>
            </div>
            <div className="wi-queue-list">
              {upcomingReal.map((q: QueueAppointment, i: number) => {
                const tokenNum = queue.length - upcomingReal.length + i + 1;
                return (
                  <div className="wi-queue-row" key={q.appointment_id}>
                    <span className="wi-queue-token">{tokenNum}</span>
                    <span className="wi-queue-name">
                      {displayPatientName(q)} <span className="wi-queue-sub">{q.is_temporary ? 'Temporary' : q.patient?.patient_id}</span>
                    </span>
                    <span className={`badge ${q.status === 'Waiting' ? 'badge-amber' : q.status === 'Called' ? 'badge-blue' : 'badge-green'}`}>{q.status}</span>
                  </div>
                );
              })}
              {(walkIn.patient || tempPatientValid) && (
                <div className="wi-queue-row preview">
                  <span className="wi-queue-token">{previewToken}</span>
                  <span className="wi-queue-name">
                    {walkIn.patient?.full_name ?? walkIn.tempPatient?.name}{' '}
                    <span className="wi-queue-sub">{walkIn.patient ? '(New Walk-in)' : '(Temporary / Unregistered)'}</span>
                  </span>
                  <span className="badge badge-amber">Waiting</span>
                </div>
              )}
              {upcomingReal.length === 0 && !walkIn.patient && !tempPatientValid && <div className="wi-list-empty">No one is currently in the queue.</div>}
            </div>
          </div>

          <div className="wi-note">
            <strong>
              <AlertIcon /> Please Note
            </strong>
            Walk-in patients are added to the queue based on the priority you select.
          </div>
        </div>
      </div>

      <div className="reg-footer">
        <button className="pat-btn" onClick={() => navigate('/dashboard')} disabled={submitting}>
          Cancel
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pat-btn" onClick={handleSaveDraft} disabled={submitting}>
            <SaveIcon /> Save as Draft
          </button>
          <button className="pat-btn primary" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            <UserPlusIcon /> {submitting ? 'Adding…' : 'Add to Queue'}
          </button>
        </div>
      </div>

      {showNewPatient && (
        <NewPatientModal
          onClose={() => setShowNewPatient(false)}
          onSuccess={async (patientId) => {
            setShowNewPatient(false);
            const res = await listPatients({ search: patientId, limit: 1 });
            const p = res.data[0];
            if (p) {
              setWalkIn((w) => ({ ...w, patient: p, patientMode: 'existing', tempPatient: null, newPatientStep: 'choose' }));
            }
          }}
        />
      )}
    </div>
  );
};

export default WalkInQueue;
