import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { getFamilyMembers } from '../../lib/families';
import { getDoctors, getAvailability, createAppointment } from '../../lib/appointments';
import type { Doctor, AvailabilitySlot } from '../../lib/appointments';
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  PatientsIcon,
  UserPlusIcon,
  SearchIcon,
  SaveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  StethoscopeIcon,
} from '../../components/layout/Icons';
import NewPatientModal from '../patients/NewPatientModal';
import ViewPatientModal from '../patients/ViewPatientModal';
import { initials, calculateAge, formatDate } from '../patients/patientUtils';
import { CONSULTATION_TYPES } from './appointmentUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import './bookAppointment.css';

const STEPS = ['Patient', 'Appointment Details', 'Confirm & Notes', 'Review & Save'];
const DRAFT_KEY = 'epoch_reception_appointment_draft';

interface BookingState {
  patientMode: 'existing' | 'new';
  patient: Patient | null;
  doctor: Doctor | null;
  consultationType: string;
  visitType: 'Appointment' | 'Follow-up';
  date: string;
  scheduledAt: string;
  slotLabel: string;
  reason: string;
}

const emptyBooking: BookingState = {
  patientMode: 'existing',
  patient: null,
  doctor: null,
  consultationType: CONSULTATION_TYPES[0],
  visitType: 'Appointment',
  date: '',
  scheduledAt: '',
  slotLabel: '',
  reason: '',
};

const loadDraft = (): BookingState | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...emptyBooking, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
};

const BookAppointment = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [booking, setBooking] = useState<BookingState>(() => loadDraft() ?? emptyBooking);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [viewPatientId, setViewPatientId] = useState<string | null>(null);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorResults, setDoctorResults] = useState<Doctor[]>([]);
  const [doctorSearching, setDoctorSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const doctorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(booking));
  }, [booking]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (doctorRef.current && !doctorRef.current.contains(e.target as Node)) setDoctorDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search-as-you-type rather than a fixed-limit dump: this dev environment alone has 140
  // Doctor accounts (mostly test fixtures), and an alphabetically-capped top-20 list would
  // push real doctors out entirely — same class of bug already found and fixed for the
  // Family picker earlier. Doctors' own /appointments/doctors?search= already supports this.
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

  const { data: familyInfo } = useApiData(
    () => (booking.patient ? getFamilyMembers(booking.patient.family_id) : Promise.resolve(null)),
    [booking.patient?.family_id]
  );
  const { data: availability, loading: availabilityLoading } = useApiData(
    () => (booking.doctor && booking.date ? getAvailability(booking.doctor.user_id, booking.date) : Promise.resolve(null)),
    [booking.doctor?.user_id, booking.date]
  );

  // Debounced patient search
  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      listPatients({ search: searchInput, status: 'active', limit: 8 })
        .then((res) => setSearchResults(res.data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const selectPatient = (patient: Patient) => {
    setBooking((b) => ({ ...b, patient }));
    setSearchInput('');
    setSearchResults([]);
  };

  const selectSlot = (slot: AvailabilitySlot) => {
    setBooking((b) => ({ ...b, scheduledAt: slot.scheduledAt, slotLabel: slot.label }));
  };

  const step1Valid = !!booking.patient;
  const step2Valid = !!booking.doctor && !!booking.date && !!booking.scheduledAt;
  const canProceed = step === 1 ? step1Valid : step === 2 ? step2Valid : true;

  const goNext = () => setStep((s) => Math.min(4, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(booking));
    navigate('/dashboard');
  };

  const handleSubmit = async () => {
    if (!booking.patient || !booking.doctor || !booking.scheduledAt) return;
    setSubmitting(true);
    setError(null);
    try {
      const result: any = await createAppointment({
        patient_id: booking.patient.patient_id,
        doctor_id: booking.doctor.user_id,
        scheduled_at: booking.scheduledAt,
        reason: booking.reason || undefined,
        consultation_type: booking.consultationType || undefined,
        visit_type: booking.visitType,
      });
      localStorage.removeItem(DRAFT_KEY);
      setCreatedId(result.appointment_id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const SummarySidebar = (
    <div className="bk-summary">
      <div className="bk-summary-title">Appointment Summary</div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <PatientsIcon />
        </span>
        <div>
          <div className="bk-summary-label">Patient</div>
          {booking.patient ? (
            <div className="bk-summary-value">
              {booking.patient.full_name} <span className="badge badge-blue">{booking.patient.patient_id}</span>
            </div>
          ) : (
            <div className="bk-summary-empty">Not selected yet</div>
          )}
        </div>
      </div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <StethoscopeIcon />
        </span>
        <div>
          <div className="bk-summary-label">Doctor</div>
          {booking.doctor ? (
            <div className="bk-summary-value">
              Dr. {booking.doctor.username}
              <div className="bk-patient-detail-row" style={{ marginTop: 0 }}>
                {booking.doctor.registration_number ? `Reg: ${booking.doctor.registration_number}` : ''}
              </div>
            </div>
          ) : (
            <div className="bk-summary-empty">Not selected yet</div>
          )}
        </div>
      </div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <CalendarIcon />
        </span>
        <div>
          <div className="bk-summary-label">Consultation Type</div>
          <div className="bk-summary-value">{booking.consultationType || <span className="bk-summary-empty">Not set</span>}</div>
        </div>
      </div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <CalendarIcon />
        </span>
        <div>
          <div className="bk-summary-label">Date</div>
          <div className="bk-summary-value">{booking.date ? formatDate(booking.date) : <span className="bk-summary-empty">Not set</span>}</div>
        </div>
      </div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <ClockIcon />
        </span>
        <div>
          <div className="bk-summary-label">Time</div>
          <div className="bk-summary-value">{booking.slotLabel || <span className="bk-summary-empty">Not set</span>}</div>
        </div>
      </div>

      <div className="bk-summary-row">
        <span className="bk-summary-icon">
          <UserPlusIcon />
        </span>
        <div>
          <div className="bk-summary-label">Visit Type</div>
          <div className="bk-summary-value">{booking.visitType}</div>
        </div>
      </div>

      <div className="bk-summary-note">
        <strong>Please Note</strong>
        Please arrive at least 10 minutes before the appointment time.
      </div>
    </div>
  );

  if (createdId) {
    return (
      <div className="reg-steps" style={{ flexDirection: 'column', maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <div className="modal-success-icon" style={{ margin: '0 auto 14px' }}>
          ✓
        </div>
        <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Appointment booked</h2>
        <p style={{ color: '#64748b', margin: '0 0 20px' }}>
          {booking.patient?.full_name} is booked with Dr. {booking.doctor?.username} on {formatDate(booking.date)} at {booking.slotLabel}.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            className="pat-btn"
            onClick={() => {
              setCreatedId(null);
              setBooking(emptyBooking);
              setStep(1);
            }}
          >
            Book Another
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
          <h1>Book Appointment</h1>
          <p>Schedule a new appointment for a patient.</p>
        </div>
        <div className="reg-breadcrumb">
          <Link to="/queue/live" style={{ color: '#2563eb', textDecoration: 'none' }}>
            Appointments &amp; Queue
          </Link>
          <span className="sep">/</span>
          <span className="current">Book Appointment</span>
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

      <div className="bk-layout">
        <div>
          {step === 1 && (
            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <PatientsIcon />
                </span>
                <span className="reg-card-title">1. Select Patient</span>
              </div>

              <div className="bk-toggle">
                <label>
                  <input type="radio" checked={booking.patientMode === 'existing'} onChange={() => setBooking((b) => ({ ...b, patientMode: 'existing' }))} />
                  Existing Patient
                </label>
                <label>
                  <input type="radio" checked={booking.patientMode === 'new'} onChange={() => setBooking((b) => ({ ...b, patientMode: 'new' }))} />
                  New Patient
                </label>
              </div>

              {booking.patientMode === 'existing' ? (
                <>
                  <div className="pat-search">
                    <SearchIcon />
                    <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
                  </div>
                  {searchInput.trim().length >= 2 && (
                    <div className="bk-search-results">
                      {searching && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Searching…</div>}
                      {!searching && searchResults.length === 0 && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>No patients found.</div>}
                      {!searching &&
                        searchResults.map((p) => (
                          <div className="bk-search-row" key={p.patient_id} onClick={() => selectPatient(p)}>
                            {p.photo_url ? <img className="pat-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pat-avatar">{initials(p.full_name)}</div>}
                            <div>
                              <div className="pat-name">{p.full_name}</div>
                              <span className="pat-muted" style={{ fontSize: 11.5 }}>
                                {p.patient_id} · {p.nic || 'No NIC'}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <button className="pat-btn primary" style={{ marginTop: 4 }} onClick={() => setShowNewPatient(true)}>
                  <UserPlusIcon /> Register New Patient
                </button>
              )}

              {booking.patient && (
                <div className="bk-patient-card">
                  <span className="bk-patient-check">
                    <CheckCircleIcon />
                  </span>
                  <div className="bk-patient-card-top">
                    {booking.patient.photo_url ? (
                      <img className="pat-avatar" style={{ width: 48, height: 48 }} src={fileUrl(booking.patient.photo_url)} alt="" />
                    ) : (
                      <div className="pat-avatar" style={{ width: 48, height: 48, fontSize: 15 }}>
                        {initials(booking.patient.full_name)}
                      </div>
                    )}
                    <div>
                      <div className="pat-name">
                        {booking.patient.full_name} <span className="badge badge-blue">{booking.patient.patient_id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bk-patient-detail-row">
                    NIC: {booking.patient.nic || booking.patient.guardian_nic || '—'} · {formatDate(booking.patient.dob)} ({calculateAge(booking.patient.dob)} Y)
                  </div>
                  <div className="bk-patient-detail-row">Phone: {booking.patient.phone || '—'}</div>
                  <div className="bk-patient-detail-row">Address: {familyInfo?.family.address || '—'}</div>
                  <button className="bk-patient-link" onClick={() => setViewPatientId(booking.patient!.patient_id)}>
                    <PatientsIcon /> View Patient Profile
                  </button>

                  {familyInfo && (
                    <div className="bk-family-card">
                      <div className="bk-family-card-left">
                        <div className="pat-avatar">
                          <PatientsIcon />
                        </div>
                        <div>
                          <div className="pat-name">{familyInfo.family.family_name}</div>
                          <span className="pat-muted" style={{ fontSize: 11.5 }}>
                            Head of Family: {familyInfo.family.head_patient?.full_name || 'Not set'}
                          </span>
                        </div>
                      </div>
                      <span className="badge badge-gray">{familyInfo.members.length} Members</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <CalendarIcon />
                </span>
                <span className="reg-card-title">2. Appointment Details</span>
              </div>

              <div className="reg-grid cols-2">
                <div className="modal-field">
                  <label>Select Doctor *</label>
                  <div className="bk-doctor-select" ref={doctorRef}>
                    {booking.doctor && !doctorDropdownOpen ? (
                      <button
                        type="button"
                        className="bk-doctor-btn"
                        onClick={() => {
                          setDoctorDropdownOpen(true);
                          setDoctorSearch(booking.doctor!.username);
                        }}
                      >
                        <div className="pat-avatar" style={{ width: 32, height: 32 }}>
                          {initials(booking.doctor.username)}
                        </div>
                        <div>
                          <div className="bk-doctor-name">Dr. {booking.doctor.username}</div>
                          <div className="bk-doctor-sub">{booking.doctor.registration_number ? `Reg: ${booking.doctor.registration_number}` : ''}</div>
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
                                setBooking((b) => ({ ...b, doctor: doc, scheduledAt: '', slotLabel: '' }));
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
                  <select value={booking.consultationType} onChange={(e) => setBooking((b) => ({ ...b, consultationType: e.target.value }))}>
                    {CONSULTATION_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="modal-field">
                  <label>Visit Type *</label>
                  <div className="bk-visit-toggle">
                    <button
                      type="button"
                      className={`bk-visit-btn${booking.visitType === 'Appointment' ? ' active' : ''}`}
                      onClick={() => setBooking((b) => ({ ...b, visitType: 'Appointment' }))}
                    >
                      <CalendarIcon /> Appointment
                    </button>
                    <button
                      type="button"
                      className={`bk-visit-btn${booking.visitType === 'Follow-up' ? ' active' : ''}`}
                      onClick={() => setBooking((b) => ({ ...b, visitType: 'Follow-up' }))}
                    >
                      <ClockIcon /> Follow-up
                    </button>
                  </div>
                </div>

                <div className="modal-field">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={booking.date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setBooking((b) => ({ ...b, date: e.target.value, scheduledAt: '', slotLabel: '' }))}
                  />
                </div>

                <div className="modal-field" style={{ gridColumn: 'span 2' }}>
                  <label>Time Slot *</label>
                  {!booking.doctor && <p className="pat-muted" style={{ fontSize: 12.5 }}>Select a doctor and date to see available slots.</p>}
                  {booking.doctor && !booking.date && <p className="pat-muted" style={{ fontSize: 12.5 }}>Select a date to see available slots.</p>}
                  {booking.doctor && booking.date && availabilityLoading && <p className="pat-muted" style={{ fontSize: 12.5 }}>Loading slots…</p>}
                  {booking.doctor && booking.date && !availabilityLoading && availability && (
                    <div className="bk-slot-grid">
                      {availability.slots.map((slot) => (
                        <button
                          key={slot.scheduledAt}
                          type="button"
                          className={`bk-slot-btn${booking.scheduledAt === slot.scheduledAt ? ' selected' : ''}`}
                          disabled={!slot.available}
                          onClick={() => selectSlot(slot)}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {booking.scheduledAt && (
                  <div className="bk-slot-confirm" style={{ gridColumn: 'span 2' }}>
                    Selected slot is available
                    <div className="sub">
                      {formatDate(booking.date)} · {booking.slotLabel}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <CheckCircleIcon />
                </span>
                <span className="reg-card-title">3. Confirm &amp; Notes</span>
              </div>

              <div className="bk-recap-grid" style={{ marginBottom: 18 }}>
                <div className="reg-review-field">
                  <span className="reg-review-label">Patient</span>
                  <span className="reg-review-value">{booking.patient?.full_name}</span>
                </div>
                <div className="reg-review-field">
                  <span className="reg-review-label">Doctor</span>
                  <span className="reg-review-value">Dr. {booking.doctor?.username}</span>
                </div>
                <div className="reg-review-field">
                  <span className="reg-review-label">Consultation Type</span>
                  <span className="reg-review-value">{booking.consultationType}</span>
                </div>
                <div className="reg-review-field">
                  <span className="reg-review-label">Visit Type</span>
                  <span className="reg-review-value">{booking.visitType}</span>
                </div>
                <div className="reg-review-field">
                  <span className="reg-review-label">Date</span>
                  <span className="reg-review-value">{formatDate(booking.date)}</span>
                </div>
                <div className="reg-review-field">
                  <span className="reg-review-label">Time</span>
                  <span className="reg-review-value">{booking.slotLabel}</span>
                </div>
              </div>

              <div className="modal-field">
                <label>Reason for Visit (Optional)</label>
                <textarea
                  rows={5}
                  maxLength={200}
                  value={booking.reason}
                  onChange={(e) => setBooking((b) => ({ ...b, reason: e.target.value }))}
                  placeholder="Enter reason for visit…"
                />
                <span className="pat-muted" style={{ fontSize: 11, alignSelf: 'flex-end' }}>
                  {booking.reason.length} / 200
                </span>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="card">
              <div className="reg-card-header">
                <span className="reg-card-icon">
                  <CheckCircleIcon />
                </span>
                <span className="reg-card-title">4. Review &amp; Save</span>
              </div>

              <div className="reg-review-section">
                <h4>Patient &amp; Doctor</h4>
                <div className="reg-review-grid">
                  <div className="reg-review-field">
                    <span className="reg-review-label">Patient</span>
                    <span className="reg-review-value">
                      {booking.patient?.full_name} ({booking.patient?.patient_id})
                    </span>
                  </div>
                  <div className="reg-review-field">
                    <span className="reg-review-label">Doctor</span>
                    <span className="reg-review-value">Dr. {booking.doctor?.username}</span>
                  </div>
                  <div className="reg-review-field">
                    <span className="reg-review-label">Consultation Type</span>
                    <span className="reg-review-value">{booking.consultationType}</span>
                  </div>
                </div>
              </div>

              <div className="reg-review-section">
                <h4>Schedule</h4>
                <div className="reg-review-grid">
                  <div className="reg-review-field">
                    <span className="reg-review-label">Visit Type</span>
                    <span className="reg-review-value">{booking.visitType}</span>
                  </div>
                  <div className="reg-review-field">
                    <span className="reg-review-label">Date</span>
                    <span className="reg-review-value">{formatDate(booking.date)}</span>
                  </div>
                  <div className="reg-review-field">
                    <span className="reg-review-label">Time</span>
                    <span className="reg-review-value">{booking.slotLabel}</span>
                  </div>
                </div>
              </div>

              <div className="reg-review-section">
                <h4>Notes</h4>
                <div className="reg-review-grid">
                  <div className="reg-review-field" style={{ gridColumn: 'span 3' }}>
                    <span className="reg-review-label">Reason for Visit</span>
                    <span className="reg-review-value">{booking.reason || 'None recorded'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {SummarySidebar}
      </div>

      <div className="reg-footer">
        <button className="pat-btn" onClick={() => navigate('/dashboard')} disabled={submitting}>
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
              {submitting ? 'Booking…' : 'Book Appointment'}
            </button>
          )}
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
              setBooking((b) => ({ ...b, patient: p, patientMode: 'existing' }));
            }
          }}
        />
      )}

      {viewPatientId && <ViewPatientModal patientId={viewPatientId} onClose={() => setViewPatientId(null)} onEdit={() => setViewPatientId(null)} />}
    </div>
  );
};

export default BookAppointment;
