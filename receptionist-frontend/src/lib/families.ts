import { api } from './api';

export interface FamilyOption {
  family_id: number;
  family_name: string;
}

// Search-as-you-type rather than a fixed-limit full dump: this dev environment alone has
// 1600+ active families accumulated from test fixtures, so any fixed cap (even a generous one)
// would silently drop real families from an alphabetically-sorted list. Powers both the
// Patients page's Family filter and the Register New Patient wizard's family picker.
export const searchFamilies = (search: string) =>
  api
    .get<{ data: (FamilyOption & { _count: { patients: number } })[] }>('/families', { params: { search, status: 'active', limit: 15 } })
    .then((r) => r.data.data);

export const setFamilyHead = (familyId: number, patientId: string) =>
  api.patch(`/families/${familyId}/head`, { patient_id: patientId }).then((r) => r.data);

export interface Family {
  family_id: number;
  family_name: string;
  head_patient_id: string | null;
  address: string | null;
  city: string | null;
  family_type: string | null;
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
  city: string | null;
  family_type: string | null;
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
  familyType?: string;
  city?: string;
  page?: number;
  limit?: number;
}

export const listFamilies = (params: ListFamiliesParams) =>
  api
    .get<{ data: Family[]; pagination: Pagination; cityOptions: string[]; familyTypeOptions: string[] }>('/families', { params })
    .then((r) => r.data);

export interface FamilyStats {
  totalFamilies: number;
  newFamiliesThisMonth: number;
  newFamiliesChangePct: number | null;
  totalFamilyMembers: number;
  activeFamilies: number;
  activeFamiliesPct: number;
  inactiveFamilies: number;
  inactiveFamiliesPct: number;
  headsOfFamily: number;
}

export const getFamilyStats = () => api.get<FamilyStats>('/families/stats').then((r) => r.data);

export const getFamily = (familyId: number) => api.get<FamilyDetail>(`/families/${familyId}`).then((r) => r.data);

export interface CreateFamilyInput {
  family_name: string;
  address?: string;
  city?: string;
  family_type?: string;
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
  nic: string | null;
  phone: string | null;
  photo_url: string | null;
  relationship_to_head: string | null;
  is_active: boolean;
  is_head: boolean;
}

export const getFamilyMembers = (familyId: number) =>
  api.get<{ family: FamilyDetail; members: FamilyMember[]; combinedHistory: unknown[] }>(`/families/${familyId}/members`).then((r) => r.data);

export const mergeFamilies = (primaryFamilyId: number, secondaryFamilyId: number, reason?: string) =>
  api.post('/families/merge', { primaryFamilyId, secondaryFamilyId, reason }).then((r) => r.data);
