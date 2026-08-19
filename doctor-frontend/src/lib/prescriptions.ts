import { api } from './api';
import type { ConsultationPatient } from './consultations';

export interface PrescriptionItemInput {
  medicine_id: number;
  dosage: string;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  qty: number;
  external_qty?: number;
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
  instructions: string | null;
  qty: number;
  external_qty: number;
  medicine: { name: string; generic_name: string | null; strength: string | null; unit: string };
  stockStatus?: string;
}

export interface Prescription {
  prescription_id: number;
  consultation_id: number;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  is_refill: boolean;
  refill_of_id: number | null;
  notes: string | null;
  issued_at: string;
  items: PrescriptionItem[];
}

export const createPrescription = (input: CreatePrescriptionInput) => api.post<Prescription>('/prescriptions', input);

export interface ListPrescriptionsParams {
  patientId?: string;
  status?: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  search?: string;
  isRefill?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PrescriptionSummary {
  prescriptionId: number;
  code: string;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  isRefill: boolean;
  notes: string | null;
  issuedAt: string;
  appointmentId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientDob: string;
  patientPhone: string | null;
  patientPhotoUrl: string | null;
  doctorId: number;
  doctorName: string;
  items: { medicine: string; dosage: string; qty: number; dispensedAt: string | null }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listPrescriptions = (params: ListPrescriptionsParams) =>
  api.get<{ data: PrescriptionSummary[]; pagination: Pagination }>('/prescriptions', { params }).then((r) => r.data);

export interface PrescriptionStats {
  total: number;
  thisMonth: number;
  thisMonthDeltaPct: number | null;
  pending: number;
  preparing: number;
  dispensed: number;
  collected: number;
}

export const getPrescriptionStats = (params?: { isRefill?: boolean }) => api.get<PrescriptionStats>('/prescriptions/stats', { params }).then((r) => r.data);

export interface PrescriptionDetailItem {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  external_qty: number;
  dispensed_at: string | null;
  medicine: { name: string; generic_name: string | null; strength: string | null; unit: string };
}

export interface PrescriptionDetail {
  prescription_id: number;
  consultation_id: number;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  is_refill: boolean;
  refill_of_id: number | null;
  notes: string | null;
  issued_at: string;
  priorVisitCount: number;
  items: PrescriptionDetailItem[];
  consultation: {
    consultation_id: number;
    diagnosis: string | null;
    icd10_code: string | null;
    appointment: {
      appointment_id: number;
      scheduled_at: string;
      patient: ConsultationPatient;
      doctor: { user_id: number; username: string; registration_number: string | null };
    };
  };
}

export const getPrescriptionDetail = (id: number) => api.get<PrescriptionDetail>(`/prescriptions/${id}`).then((r) => r.data);

export interface PastPrescriptionItem {
  medicineId: number;
  medicine: string;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
}

export interface PastPrescription {
  prescriptionId: number;
  code: string;
  issuedAt: string;
  items: PastPrescriptionItem[];
}

export interface PrescriptionContext {
  consultation: { consultationId: number; status: string; diagnosis: string | null; icd10Code: string | null };
  appointment: { appointmentId: number; scheduledAt: string; patient: ConsultationPatient; doctor: { user_id: number; username: string; registration_number: string | null } };
  existingPrescriptions: { prescription_id: number; status: string; issued_at: string }[];
  patientSummary: { allergies: string | null; chronicConditions: string[]; currentMedications: string[]; priorVisitCount: number };
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

// Opens in a new tab (rather than forcing a download, like downloadPrescriptionPdf above) so the
// browser's own PDF viewer serves as the "preview" step before the doctor prints the slip.
export const downloadExternalPurchaseSlip = async (prescriptionId: number) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/external-slip`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};
