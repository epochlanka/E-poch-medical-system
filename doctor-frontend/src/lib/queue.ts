import { api } from './api';

export type AppointmentStatus = 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped' | 'Cancelled' | 'No Show';

export interface QueuePatient {
  patient_id: string;
  full_name: string;
  gender: string;
  dob: string;
  phone: string | null;
}

export interface QueueDoctor {
  user_id: number;
  username: string;
  registration_number: string | null;
}

export interface QueueAppointment {
  appointment_id: number;
  patient_id: string;
  doctor_id: number;
  scheduled_at: string;
  reason: string | null;
  status: AppointmentStatus;
  skip_reason: string | null;
  skipped_at: string | null;
  patient: QueuePatient;
  doctor: QueueDoctor;
  consultation?: { created_at: string } | null;
}

// Both auto-scope to the caller's own appointments when the caller is a Doctor (server-side —
// see backend/src/modules/appointments/controller.ts's doctorScope helper), regardless of any
// doctorId param.
export const getLiveQueue = () => api.get<QueueAppointment[]>('/appointments/queue').then((r) => r.data);

export interface QueueStats {
  totalInQueue: number;
  waitingOver30: number;
  inConsultation: number;
  completedToday: number;
  avgWaitingTimeMinutes: number;
  longestWaitingTimeMinutes: number;
}

export const getQueueStats = () => api.get<QueueStats>('/appointments/queue/stats').then((r) => r.data);

export interface ListAppointmentsParams {
  search?: string;
  status?: AppointmentStatus | 'Upcoming';
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listAppointments = (params: ListAppointmentsParams) =>
  api.get<{ data: QueueAppointment[]; pagination: Pagination }>('/appointments/list', { params }).then((r) => r.data);

export const updateAppointmentStatus = (appointmentId: number, status: AppointmentStatus) =>
  api.patch<QueueAppointment>(`/appointments/${appointmentId}/status`, { status }).then((r) => r.data);

export const skipAppointment = (appointmentId: number, reason: string) =>
  api.patch<QueueAppointment>(`/appointments/${appointmentId}/skip`, { reason }).then((r) => r.data);

export interface SkipStats {
  totalSkipped: number;
  skippedToday: number;
  skippedOver30: number;
  longestSkippedWaitMinutes: number;
}

export const getSkipStats = (params?: { dateFrom?: string; dateTo?: string }) =>
  api.get<SkipStats>('/appointments/skip-stats', { params }).then((r) => r.data);

export const tokenNumber = (appointmentId: number) => `T-${String(appointmentId).padStart(3, '0')}`;

export const calculateAge = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const waitingMinutes = (scheduledAt: string) => Math.max(0, Math.round((Date.now() - new Date(scheduledAt).getTime()) / 60000));
