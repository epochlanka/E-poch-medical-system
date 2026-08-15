import { api } from './api';

export interface PatientListRow {
  patient_id: string;
  family_id: number;
  nic: string | null;
  guardian_nic: string | null;
  full_name: string;
  dob: string;
  gender: string;
  phone: string | null;
  blood_group: string | null;
  allergies: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  family: { family_id: number; family_name: string };
  last_visit: string | null;
}

export interface ListPatientsParams {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  gender?: string;
  bloodGroup?: string;
  ageFrom?: number;
  ageTo?: number;
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listPatients = (params: ListPatientsParams) =>
  api.get<{ data: PatientListRow[]; pagination: Pagination }>('/patients', { params }).then((r) => r.data);

export interface PatientDetail extends Omit<PatientListRow, 'family'> {
  family: { family_id: number; family_name: string; address: string | null; contact_no: string | null; head_patient_id: string | null; is_active: boolean };
  clinicalSummary: {
    chronicConditions: string[];
    currentMedications: string[];
    nextFollowUp: { date: string; doctorName: string } | null;
  };
}

export const getPatientById = (patientId: string) => api.get<PatientDetail>(`/patients/${encodeURIComponent(patientId)}`).then((r) => r.data);

export type TimelineEventType = 'appointment' | 'consultation' | 'prescription' | 'invoice' | 'document' | 'vitals';

export interface AppointmentEvent {
  type: 'appointment';
  date: string;
  appointmentId: number;
  status: string;
  doctorName: string;
}
export interface ConsultationEvent {
  type: 'consultation';
  date: string;
  consultationId: number;
  appointmentId: number;
  diagnosis: string | null;
  status: string;
  followUpDate: string | null;
}
export interface PrescriptionEvent {
  type: 'prescription';
  date: string;
  prescriptionId: number;
  status: string;
  items: { medicine: string; dosage: string; qty: number }[];
}
export interface InvoiceEvent {
  type: 'invoice';
  date: string;
  invoiceId: number;
  totalAmount: number;
  paymentStatus: string;
}
export interface DocumentEvent {
  type: 'document';
  date: string;
  documentId: number;
  consultationId: number;
  filename: string;
  originalName: string;
  mimeType: string;
}
export interface VitalsEvent {
  type: 'vitals';
  date: string;
  consultationId: number;
  vitals: {
    bp_systolic?: number;
    bp_diastolic?: number;
    temp?: number;
    pulse?: number;
    respiratory_rate?: number;
    spo2?: number;
    weight?: number;
    height?: number;
    bmi?: number | null;
  };
}

export type TimelineEvent = AppointmentEvent | ConsultationEvent | PrescriptionEvent | InvoiceEvent | DocumentEvent | VitalsEvent;

export interface HistoryParams {
  from?: string;
  to?: string;
  types?: TimelineEventType[];
}

export const getPatientHistory = (patientId: string, params?: HistoryParams) =>
  api
    .get<TimelineEvent[]>(`/patients/${encodeURIComponent(patientId)}/history`, {
      params: { from: params?.from, to: params?.to, types: params?.types?.join(',') },
    })
    .then((r) => r.data);

export const downloadPatientHistoryPdf = async (patientId: string, fileName: string) => {
  const res = await api.get(`/patients/${encodeURIComponent(patientId)}/history/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};
