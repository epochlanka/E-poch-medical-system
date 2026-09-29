import { api } from './api';

export interface Alert {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch' | 'skipped-appointment';
  severity: 'red' | 'amber';
  message: string;
  refId: number | string;
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

// Both already auto-scope to the caller's own patients server-side when the caller is a Doctor
// (see backend/src/modules/dashboard/controller.ts's doctorScope helper) — no doctorId param needed.
export const getAlerts = () => api.get<Alert[]>('/dashboard/alerts').then((r) => r.data);
export const getFollowUps = () => api.get<FollowUp[]>('/dashboard/follow-ups').then((r) => r.data);

export interface DoctorDashboardKpis {
  totalAppointmentsToday: number;
  totalAppointmentsTodayChangePct: number | null;
  completedConsultationsToday: number;
  completedConsultationsTodayChangePct: number | null;
  pendingConsultationsInQueue: number;
  followUpsDueThisWeek: number;
  prescriptionsIssuedToday: number;
  prescriptionsIssuedTodayChangePct: number | null;
  pendingLabReports: number;
}

export interface ScheduleEntry {
  appointmentId: number;
  scheduledAt: string;
  patientId: string;
  patientName: string;
  status: 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped' | 'Cancelled' | 'No Show';
}

export interface RecentPrescription {
  prescriptionId: number;
  code: string;
  status: 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';
  issuedAt: string;
  patientId: string;
  patientName: string;
}

export interface DoctorDashboard {
  kpis: DoctorDashboardKpis;
  todaysSchedule: ScheduleEntry[];
  consultationsOverview: { date: string; count: number }[];
  recentPrescriptions: RecentPrescription[];
}

export const getDoctorDashboard = () => api.get<DoctorDashboard>('/dashboard/doctor-overview').then((r) => r.data);

export interface FollowUpRow {
  consultationId: number;
  appointmentId: number;
  followUpDate: string;
  lastVisitDate: string;
  diagnosis: string | null;
  complaint: string | null;
  patient: { patient_id: string; full_name: string; gender: string; dob: string; phone: string | null; photo_url: string | null };
  doctorId: number;
  doctorName: string;
}

export interface FollowUpCounts {
  total: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  dueThisMonth: number;
}

export interface FollowUpsListParams {
  bucket?: 'all' | 'overdue' | 'today' | 'week' | 'month';
  search?: string;
  page?: number;
  limit?: number;
}

export const getFollowUpsList = (params: FollowUpsListParams) =>
  api
    .get<{ data: FollowUpRow[]; pagination: { page: number; limit: number; total: number; totalPages: number }; counts: FollowUpCounts }>(
      '/dashboard/follow-ups/list',
      { params }
    )
    .then((r) => r.data);
