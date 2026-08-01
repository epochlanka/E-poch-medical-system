import { api } from './api';

export interface Overview {
  todaysPatients: number;
  todaysPatientsChangePct: number | null;
  revenueToday: number;
  revenueTodayChangePct: number | null;
  totalAppointmentsToday: number;
  totalAppointmentsTodayChangePct: number | null;
  pendingPrescriptions: number;
  lowStockCount: number;
  expiringBatchesCount: number;
}

export interface AppointmentSummary {
  appointmentId: number;
  patientId: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
  status: 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped';
  scheduledAt: string;
}

export interface QueueSnapshot {
  counts: Record<string, number>;
  queueLength: number;
  queue: AppointmentSummary[];
  appointmentsToday: AppointmentSummary[];
}

export interface FollowUp {
  consultationId: number;
  followUpDate: string;
  isOverdue: boolean;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  doctorId: number;
  doctorName: string;
}

export interface Alert {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch' | 'skipped-appointment';
  severity: 'red' | 'amber';
  message: string;
  refId: number | string;
}

export interface RevenueTrend {
  series: { date: string; total: number }[];
  total: number;
  changePct: number | null;
}

export interface RecentPrescription {
  prescriptionId: number;
  code: string;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  issuedAt: string;
  patientId: string;
  patientName: string;
}

export interface TopMedicine {
  medicineId: number;
  name: string;
  unitsSold: number;
}

export const getOverview = () => api.get<Overview>('/dashboard/overview').then((r) => r.data);
export const getQueueSnapshot = () => api.get<QueueSnapshot>('/dashboard/queue').then((r) => r.data);
export const getFollowUps = () => api.get<FollowUp[]>('/dashboard/follow-ups').then((r) => r.data);
export const getAlerts = () => api.get<Alert[]>('/dashboard/alerts').then((r) => r.data);
export const getRevenueTrend = (days = 30) =>
  api.get<RevenueTrend>('/dashboard/revenue-trend', { params: { days } }).then((r) => r.data);
export const getRecentPrescriptions = (limit = 5) =>
  api.get<RecentPrescription[]>('/dashboard/recent-prescriptions', { params: { limit } }).then((r) => r.data);
export const getTopMedicines = (limit = 5) =>
  api.get<TopMedicine[]>('/dashboard/top-medicines', { params: { limit } }).then((r) => r.data);
