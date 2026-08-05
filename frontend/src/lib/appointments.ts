import { api } from './api';

export type AppointmentStatus = 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped' | 'Cancelled' | 'No Show';

export interface QueueAppointment {
  appointment_id: number;
  patient_id: string;
  doctor_id: number;
  scheduled_at: string;
  reason: string | null;
  status: AppointmentStatus;
  patient: { full_name: string; gender: string; dob: string; phone: string | null };
  doctor: { username: string; registration_number: string | null };
}

export const getLiveQueue = () => api.get<QueueAppointment[]>('/appointments/queue').then((r) => r.data);

export const updateAppointmentStatus = (appointmentId: number, status: AppointmentStatus) =>
  api.patch(`/appointments/${appointmentId}/status`, { status }).then((r) => r.data);

export const updateAppointmentTime = (appointmentId: number, scheduledAt: string) =>
  api.patch(`/appointments/${appointmentId}/time`, { scheduled_at: scheduledAt }).then((r) => r.data);

export interface Doctor {
  user_id: number;
  username: string;
  registration_number: string | null;
}

export const listDoctors = (search?: string) => api.get<{ data: Doctor[] }>('/appointments/doctors', { params: { search } }).then((r) => r.data.data);

export interface CreateAppointmentInput {
  patient_id: string;
  doctor_id: number;
  scheduled_at: string;
  reason?: string;
}

export const createAppointment = (input: CreateAppointmentInput) => api.post<QueueAppointment>('/appointments', input).then((r) => r.data);

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type AppointmentListStatus = AppointmentStatus | 'Upcoming';

export interface ListAppointmentsParams {
  search?: string;
  doctorId?: number;
  status?: AppointmentListStatus;
  date?: string;
  page?: number;
  limit?: number;
}

export const listAppointments = (params: ListAppointmentsParams) =>
  api.get<{ data: QueueAppointment[]; pagination: Pagination }>('/appointments/list', { params }).then((r) => r.data);

export interface AppointmentStats {
  todaysAppointments: number;
  upcomingThisWeek: number;
  completedThisWeek: number;
  cancelledThisWeek: number;
  noShowThisWeek: number;
}

export const getAppointmentStats = () => api.get<AppointmentStats>('/appointments/stats').then((r) => r.data);

export interface ScheduleBlock {
  label: string;
  count: number;
}

export const getTodaysSchedule = () => api.get<ScheduleBlock[]>('/appointments/today-schedule').then((r) => r.data);

export interface CalendarDaySummary {
  date: string;
  total: number;
  cancelled: number;
  noShow: number;
}

export const getCalendarSummary = (year: number, month: number) =>
  api.get<CalendarDaySummary[]>('/appointments/calendar', { params: { year, month } }).then((r) => r.data);
