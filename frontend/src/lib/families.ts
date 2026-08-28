import { api } from './api';

export interface Family {
  family_id: number;
  family_name: string;
  head_patient_id: string | null;
  address: string | null;
  contact_no: string | null;
  is_active: boolean;
  created_at: string;
  head_patient: { patient_id: string; full_name: string } | null;
  _count: { patients: number };
}

export interface FamilyDetail {
  family_id: number;
  family_name: string;
  head_patient_id: string | null;
  address: string | null;
  contact_no: string | null;
  is_active: boolean;
  created_at: string;
  head_patient: { patient_id: string; full_name: string } | null;
  patients: { patient_id: string; full_name: string; dob: string; gender: string; is_active: boolean }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListFamiliesParams {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
}

export const listFamilies = (params: ListFamiliesParams) =>
  api.get<{ data: Family[]; pagination: Pagination }>('/families', { params }).then((r) => r.data);

export interface FamilyStats {
  totalFamilies: number;
  newFamiliesThisMonth: number;
  newFamiliesChangePct: number | null;
  totalFamilyMembers: number;
  activeFamilies: number;
  activeFamiliesPct: number;
  inactiveFamilies: number;
  inactiveFamiliesPct: number;
}

export const getFamilyStats = () => api.get<FamilyStats>('/families/stats').then((r) => r.data);

export const getFamily = (familyId: number) => api.get<FamilyDetail>(`/families/${familyId}`).then((r) => r.data);

export interface CreateFamilyInput {
  family_name: string;
  address?: string;
  contact_no?: string;
}

export const createFamily = (input: CreateFamilyInput) => api.post<Family>('/families', input).then((r) => r.data);

export const updateFamily = (familyId: number, input: Partial<CreateFamilyInput>) =>
  api.put<Family>(`/families/${familyId}`, input).then((r) => r.data);

export interface FamilyMember {
  patient_id: string;
  full_name: string;
  dob: string;
  gender: string;
  is_active: boolean;
  is_head: boolean;
}

export const getFamilyMembers = (familyId: number) =>
  api.get<{ family: FamilyDetail; members: FamilyMember[]; combinedHistory: unknown[] }>(`/families/${familyId}/members`).then((r) => r.data);

export const setHeadOfFamily = (familyId: number, patientId: string) =>
  api.patch(`/families/${familyId}/head`, { patient_id: patientId }).then((r) => r.data);

export const mergeFamilies = (primaryFamilyId: number, secondaryFamilyId: number, reason?: string) =>
  api.post('/families/merge', { primaryFamilyId, secondaryFamilyId, reason }).then((r) => r.data);
