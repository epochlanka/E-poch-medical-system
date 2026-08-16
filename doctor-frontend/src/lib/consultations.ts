import { api } from './api';

export interface Vitals {
  bp_systolic?: number;
  bp_diastolic?: number;
  temp?: number;
  pulse?: number;
  respiratory_rate?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  bmi?: number | null;
}

export interface ConsultationPrescription {
  prescription_id: number;
  status: string;
  is_refill: boolean;
  issued_at: string;
}

export interface Consultation {
  consultation_id: number;
  appointment_id: number;
  allergies_ack: boolean;
  complaint: string | null;
  history_of_present_illness: string | null;
  examination_findings: string | null;
  medicalHistory: string[];
  diagnosis: string | null;
  icd10_code: string | null;
  notes: string | null;
  follow_up_date: string | null;
  status: 'Draft' | 'Finalized';
  created_at: string;
  finalized_at: string | null;
  vitals: Vitals | null;
  prescriptions: ConsultationPrescription[];
}

export interface ConsultationPatient {
  patient_id: string;
  full_name: string;
  dob: string;
  gender: string;
  phone: string | null;
  allergies: string | null;
  blood_group: string | null;
  photo_url: string | null;
}

export interface ConsultationContext {
  appointment: {
    appointmentId: number;
    status: string;
    scheduledAt: string;
    patient: ConsultationPatient;
    doctor: { user_id: number; username: string; registration_number: string | null };
  };
  consultation: Consultation | null;
  patientSummary: {
    bloodGroup: string | null;
    allergies: string | null;
    chronicConditions: string[];
    currentMedications: string[];
    lastVisit: string | null;
  };
  recentConsultations: { diagnosis: string | null; date: string }[];
}

export const getConsultationContext = (appointmentId: number) =>
  api.get<ConsultationContext>(`/consultations/context/${appointmentId}`).then((r) => r.data);

export interface ConsultationInput {
  vitals?: Vitals;
  complaint?: string;
  history_of_present_illness?: string;
  examination_findings?: string;
  medical_history?: string[];
  diagnosis?: string;
  icd10_code?: string;
  notes?: string;
  follow_up_date?: string | null;
  allergies_ack?: boolean;
}

export const createConsultation = (appointmentId: number, input: ConsultationInput) =>
  api.post<Consultation>('/consultations', { appointment_id: appointmentId, ...input }).then((r) => r.data);

export const updateConsultation = (consultationId: number, input: ConsultationInput) =>
  api.put<Consultation>(`/consultations/${consultationId}`, input).then((r) => r.data);

export const finalizeConsultation = (consultationId: number) =>
  api.post<Consultation>(`/consultations/${consultationId}/finalize`).then((r) => r.data);

// A Finalized consultation can never be edited through the same form as a Draft (BR-08/FR-037) —
// a correction goes through this logged amend path instead, one field at a time with a reason.
export const AMENDABLE_FIELDS = [
  { field: 'complaint', label: 'Chief Complaint' },
  { field: 'history_of_present_illness', label: 'History of Present Illness' },
  { field: 'examination_findings', label: 'Examination Findings' },
  { field: 'diagnosis', label: 'Diagnosis' },
  { field: 'icd10_code', label: 'ICD-10 Code' },
  { field: 'notes', label: 'Notes' },
  { field: 'follow_up_date', label: 'Follow-up Date' },
] as const;
export type AmendableField = (typeof AMENDABLE_FIELDS)[number]['field'];

export const amendConsultation = (consultationId: number, field: AmendableField, new_value: string | null, reason: string) =>
  api.post<Consultation>(`/consultations/${consultationId}/amend`, { field, new_value, reason }).then((r) => r.data);

export interface AmendmentEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  amendedBy: string;
  amendedAt: string;
}

export const listAmendments = (consultationId: number) =>
  api.get<AmendmentEntry[]>(`/consultations/${consultationId}/amendments`).then((r) => r.data);

export interface ConsultationSummary {
  consultationId: number;
  appointmentId: number;
  status: 'Draft' | 'Finalized';
  complaint: string | null;
  diagnosis: string | null;
  icd10Code: string | null;
  notes: string | null;
  createdAt: string;
  followUpDate: string | null;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientDob: string;
  patientPhone: string | null;
  patientPhotoUrl: string | null;
  doctorId: number;
  doctorName: string;
}

export interface ListConsultationsParams {
  patientId?: string;
  search?: string;
  status?: 'Draft' | 'Finalized';
  from?: string;
  to?: string;
  followUpOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listConsultations = (params: ListConsultationsParams) =>
  api.get<{ data: ConsultationSummary[]; pagination: Pagination }>('/consultations', { params }).then((r) => r.data);
