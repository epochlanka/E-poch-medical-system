import { api } from './api';

export interface RegisterPatientInput {
  full_name: string;
  dob: string;
  gender: string;
  nic?: string;
  guardian_nic?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  family_id?: number;
  new_family?: { family_name: string; address?: string; contact_no?: string };
}

export const registerPatient = (input: RegisterPatientInput) =>
  api.post('/patients', input).then((r) => r.data);

export interface Patient {
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

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListPatientsParams {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  gender?: string;
  bloodGroup?: string;
  page?: number;
  limit?: number;
}

export const listPatients = (params: ListPatientsParams) =>
  api.get<{ data: Patient[]; pagination: Pagination }>('/patients', { params }).then((r) => r.data);

export interface PatientStats {
  totalPatients: number;
  newPatientsThisMonth: number;
  newPatientsChangePct: number | null;
  activePatients: number;
  malePatients: number;
  malePatientsPct: number;
  femalePatients: number;
  femalePatientsPct: number;
}

export const getPatientStats = () => api.get<PatientStats>('/patients/stats').then((r) => r.data);

export const getPatient = (patientId: string) => api.get<Patient>(`/patients/${patientId}`).then((r) => r.data);

export interface UpdatePatientInput {
  full_name?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  gender?: string;
}

export const updatePatient = (patientId: string, input: UpdatePatientInput) =>
  api.put(`/patients/${patientId}`, input).then((r) => r.data);

export const setPatientStatus = (patientId: string, is_active: boolean, reason?: string) =>
  api.patch(`/patients/${patientId}/status`, { is_active, reason }).then((r) => r.data);
