import { api } from './api';

export interface ConsultationListItem {
  consultationId: number;
  appointmentId: number;
  status: 'Draft' | 'Finalized';
  complaint: string | null;
  diagnosis: string | null;
  createdAt: string;
  patientId: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
}

export interface ListConsultationsParams {
  patientId?: string;
  status?: 'Draft' | 'Finalized';
  page?: number;
  limit?: number;
}

export const listConsultations = (params: ListConsultationsParams) =>
  api
    .get<{ data: ConsultationListItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/consultations', { params })
    .then((r) => r.data);
