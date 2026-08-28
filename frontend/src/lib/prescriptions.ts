import { api } from './api';
import type { ConsultationPatient } from './consultations';

export interface PrescriptionItemInput {
  medicine_id: number;
  dosage: string;
  frequency?: string;
  duration?: string;
  route?: string;
  qty: number;
}

export interface CreatePrescriptionInput {
  consultation_id: number;
  items?: PrescriptionItemInput[];
  refill_of_prescription_id?: number;
  allergyAck?: boolean;
  notes?: string;
}

export interface PrescriptionItem {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  qty: number;
  medicine: { name: string; generic_name: string | null; strength: string | null; unit: string };
  stockStatus?: string;
}

export interface Prescription {
  prescription_id: number;
  consultation_id: number;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  is_refill: boolean;
  refill_of_id: number | null;
  issued_at: string;
  items: PrescriptionItem[];
}

export const createPrescription = (input: CreatePrescriptionInput) => api.post<Prescription>('/prescriptions', input);

export const getPrescription = (id: number) => api.get<Prescription>(`/prescriptions/${id}`).then((r) => r.data);

export interface ListPrescriptionsParams {
  patientId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PrescriptionSummary {
  prescriptionId: number;
  code: string;
  status: string;
  isRefill: boolean;
  issuedAt: string;
  patientId: string;
  patientName: string;
  items: { medicine: string; dosage: string; qty: number }[];
}

export const listPrescriptions = (params: ListPrescriptionsParams) =>
  api.get<{ data: PrescriptionSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/prescriptions', { params }).then((r) => r.data);

export interface PastPrescriptionItem {
  medicineId: number;
  medicine: string;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  qty: number;
}

export interface PastPrescription {
  prescriptionId: number;
  code: string;
  issuedAt: string;
  items: PastPrescriptionItem[];
}

export interface PrescriptionContext {
  consultation: { consultationId: number; status: string; diagnosis: string | null };
  appointment: { appointmentId: number; scheduledAt: string; patient: ConsultationPatient; doctor: { user_id: number; username: string; registration_number: string | null } };
  existingPrescriptions: { prescription_id: number; status: string; issued_at: string }[];
  patientSummary: { allergies: string | null; chronicConditions: string[] };
  pastPrescriptions: PastPrescription[];
}

export const getPrescriptionContext = (consultationId: number) =>
  api.get<PrescriptionContext>(`/prescriptions/context/${consultationId}`).then((r) => r.data);

export const downloadPrescriptionPdf = async (prescriptionId: number, code: string) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
