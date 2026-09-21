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
  nationality?: string;
  marital_status?: string;
  occupation?: string;
  employer_school?: string;
  relationship_to_head?: string;
  chronic_conditions?: string;
  current_medications?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  family_id?: number;
  new_family?: { family_name: string; address?: string; contact_no?: string };
}

export const registerPatient = (input: RegisterPatientInput) =>
  api.post<{ patient: Patient; duplicateFlags: unknown[] }>('/patients', input).then((r) => r.data);

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
  nationality: string | null;
  marital_status: string | null;
  occupation: string | null;
  employer_school: string | null;
  relationship_to_head: string | null;
  chronic_conditions: string | null;
  current_medications: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
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
  ageFrom?: number;
  ageTo?: number;
  familyId?: number;
  page?: number;
  limit?: number;
}

export const listPatients = (params: ListPatientsParams) =>
  api.get<{ data: Patient[]; pagination: Pagination }>('/patients', { params }).then((r) => r.data);

export const getPatient = (patientId: string) => api.get<Patient>(`/patients/${patientId}`).then((r) => r.data);

export interface UpdatePatientInput {
  full_name?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  gender?: string;
  relationship_to_head?: string;
}

export const updatePatient = (patientId: string, input: UpdatePatientInput) =>
  api.put(`/patients/${patientId}`, input).then((r) => r.data);

export const setPatientStatus = (patientId: string, is_active: boolean, reason?: string) =>
  api.patch(`/patients/${patientId}/status`, { is_active, reason }).then((r) => r.data);

export interface DuplicateCheckResult {
  exists: boolean;
  patient: { patient_id: string; full_name: string; is_active: boolean } | null;
}

export const checkDuplicatePatient = (params: { nic?: string; guardianNic?: string; dob?: string }) =>
  api.get<DuplicateCheckResult>('/patients/check-duplicate', { params }).then((r) => r.data);

export const uploadPatientPhoto = (patientId: string, file: File) => {
  const form = new FormData();
  form.append('photo', file);
  return api.post(`/patients/${patientId}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};
