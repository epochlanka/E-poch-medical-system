import { api } from './api';

export type MatchFieldStatus = 'exact' | 'similar' | 'different' | 'unavailable';
export interface MatchField {
  status: MatchFieldStatus;
  detail: string;
  value: string | null;
}

export interface DuplicatePatientSummary {
  patient_id: string;
  full_name: string;
  dob: string;
  nic: string | null;
  phone: string | null;
  is_active: boolean;
  photo_url: string | null;
  family: { address: string | null } | null;
}

export type MatchBand = 'very-high' | 'high' | 'moderate' | 'low';

export interface DuplicateFlag {
  flagId: number;
  status: 'Pending' | 'Dismissed' | 'Merged';
  matchReason: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  addedBy: 'System';
  patient: DuplicatePatientSummary;
  matchedPatient: DuplicatePatientSummary;
  matchScorePct: number;
  matchLabel: string;
  matchBand: MatchBand;
  breakdown: { dob: MatchField; nic: MatchField; phone: MatchField; address: MatchField };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListDuplicateFlagsParams {
  status?: 'Pending' | 'Dismissed' | 'Merged' | 'All';
  search?: string;
  matchBand?: MatchBand | 'all';
  dateFrom?: string;
  dateTo?: string;
  reviewedBy?: string;
  page?: number;
  limit?: number;
}

export const listDuplicateFlags = (params: ListDuplicateFlagsParams) =>
  api
    .get<{ data: DuplicateFlag[]; pagination: Pagination; reviewedByOptions: string[] }>('/patients/duplicates', { params })
    .then((r) => r.data);

export interface DuplicateStats {
  pendingReview: number;
  reviewedToday: number;
  mergedToday: number;
  dismissedToday: number;
}

export const getDuplicateStats = () => api.get<DuplicateStats>('/patients/duplicates/stats').then((r) => r.data);

export const dismissDuplicateFlag = (flagId: number) => api.post(`/patients/duplicates/${flagId}/dismiss`).then((r) => r.data);

export const mergeDuplicateFlag = (flagId: number, primaryPatientId: string) =>
  api.post(`/patients/duplicates/${flagId}/merge`, { primaryPatientId }).then((r) => r.data);
