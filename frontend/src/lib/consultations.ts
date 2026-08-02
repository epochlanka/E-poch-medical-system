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

export interface ConsultationDocument {
  document_id: number;
  consultation_id: number;
  original_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploader: { username: string };
}

export interface ConsultationPrescription {
  prescription_id: number;
  status: string;
  is_refill: boolean;
  issued_at: string;
}

export interface ConsultationInvoice {
  invoice_id: number;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  created_at: string;
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
  documents: ConsultationDocument[];
  prescriptions: ConsultationPrescription[];
  invoices: ConsultationInvoice[];
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

export const amendConsultation = (consultationId: number, field: string, new_value: string | null, reason: string) =>
  api.post(`/consultations/${consultationId}/amend`, { field, new_value, reason }).then((r) => r.data);

export const uploadConsultationDocument = (consultationId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<ConsultationDocument>(`/consultations/${consultationId}/documents`, formData).then((r) => r.data);
};

export const deleteConsultationDocument = (documentId: number) => api.delete(`/consultations/documents/${documentId}`);

export interface ListConsultationsParams {
  patientId?: string;
  status?: 'Draft' | 'Finalized';
  page?: number;
  limit?: number;
}

export interface ConsultationSummary {
  consultationId: number;
  appointmentId: number;
  status: string;
  diagnosis: string | null;
  createdAt: string;
  followUpDate: string | null;
  patientId: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
}

export const listConsultations = (params: ListConsultationsParams) =>
  api.get<{ data: ConsultationSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/consultations', { params }).then((r) => r.data);
