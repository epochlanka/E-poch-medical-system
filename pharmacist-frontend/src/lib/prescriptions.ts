import { api } from './api';

export type PrescriptionStatus = 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';

export interface PrescriptionListItem {
  prescriptionId: number;
  code: string;
  status: PrescriptionStatus;
  isRefill: boolean;
  notes: string | null;
  issuedAt: string;
  appointmentId: number;
  consultationType: string | null;
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

export interface ListPrescriptionsParams {
  patientId?: string;
  doctorId?: number;
  status?: PrescriptionStatus;
  search?: string;
  consultationType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const listPrescriptions = (params: ListPrescriptionsParams) =>
  api.get<{ data: PrescriptionListItem[]; pagination: Pagination }>('/prescriptions', { params }).then((r) => r.data);

export interface PrescriptionStats {
  total: number;
  thisMonth: number;
  thisMonthDeltaPct: number | null;
  pending: number;
  preparing: number;
  dispensed: number;
  collected: number;
}

export const getPrescriptionStats = (doctorId?: number) => api.get<PrescriptionStats>('/prescriptions/stats', { params: { doctorId } }).then((r) => r.data);

export interface PrescriptionItemDetail {
  rx_item_id: number;
  medicine_id: number;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  qty: number;
  external_qty: number;
  dispensed_qty: number; // cumulative qty drawn from clinic stock across partial dispenses (excludes external_qty)
  batch_id: number | null;
  dispensed_at: string | null;
  medicine: { name: string; unit: string };
  substituted_medicine: { name: string } | null;
  batch: { batch_no: string; expiry_date: string } | null;
}

export interface PrescriptionDetail {
  prescription_id: number;
  status: PrescriptionStatus;
  is_refill: boolean;
  notes: string | null;
  issued_at: string;
  items: PrescriptionItemDetail[];
  consultation: {
    consultation_id: number;
    diagnosis: string | null;
    appointment_id: number;
    appointment: {
      appointment_id: number;
      consultation_type: string | null;
      scheduled_at: string;
      // Null for a temporary/unregistered walk-in — use displayDetailPatient() below.
      patient: { patient_id: string; full_name: string; gender: string; dob: string; phone: string | null; allergies: string | null } | null;
      is_temporary: boolean;
      temp_patient_name: string | null;
      temp_patient_gender: string | null;
      temp_patient_phone: string | null;
      temp_patient_age: number | null;
      doctor: { user_id: number; username: string; registration_number: string | null };
    };
  };
}

export const getPrescription = (prescriptionId: number) => api.get<PrescriptionDetail>(`/prescriptions/${prescriptionId}`).then((r) => r.data);

// Normalizes a registered Patient and a temporary walk-in's minimal captured details into one
// always-non-null shape, so pharmacy views can render displayDetailPatient(detail).fullName etc.
// without a null check at every call site.
export const displayDetailPatient = (detail: Pick<PrescriptionDetail, 'consultation'>) => {
  const a = detail.consultation.appointment;
  return {
    patientId: a.patient?.patient_id ?? null,
    fullName: a.patient?.full_name ?? a.temp_patient_name ?? 'Unregistered Patient',
    gender: a.patient?.gender ?? a.temp_patient_gender ?? null,
    dob: a.patient?.dob ?? null,
    approxAge: a.temp_patient_age ?? null,
    phone: a.patient?.phone ?? a.temp_patient_phone ?? null,
    allergies: a.patient?.allergies ?? null,
    isTemporary: a.is_temporary,
  };
};

// The PDF route only accepts a Bearer Authorization header (no query-param token support in
// requireAuth), so a plain <a href>/window.open() can't carry auth — fetch it as a blob through
// the authenticated axios instance instead and trigger the download client-side.
export const downloadPrescriptionPdf = async (prescriptionId: number, code: string) => {
  const res = await api.get(`/prescriptions/${prescriptionId}/pdf`, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
