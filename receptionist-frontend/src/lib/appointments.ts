import { api } from './api';

export interface Doctor {
  user_id: number;
  username: string;
  registration_number: string | null;
}

export const getDoctors = (search?: string) => api.get<{ data: Doctor[] }>('/appointments/doctors', { params: { search } }).then((r) => r.data.data);

export interface AvailabilitySlot {
  scheduledAt: string;
  label: string;
  available: boolean;
}

export const getAvailability = (doctorId: number, date: string) =>
  api.get<{ date: string; slots: AvailabilitySlot[] }>('/appointments/availability', { params: { doctorId, date } }).then((r) => r.data);

export interface CreateAppointmentInput {
  patient_id: string;
  doctor_id: number;
  scheduled_at: string;
  reason?: string;
  is_walk_in?: boolean;
  consultation_type?: string;
  visit_type?: 'Appointment' | 'Follow-up';
  priority?: 'Normal' | 'Urgent' | 'Emergency';
  notes?: string;
}

export const createAppointment = (input: CreateAppointmentInput) => api.post('/appointments', input).then((r) => r.data);

export interface QueueAppointment {
  appointment_id: number;
  scheduled_at: string;
  status: string;
  priority?: string;
  is_walk_in: boolean;
  patient: { full_name: string; patient_id: string };
  doctor: { user_id: number; username: string; registration_number: string | null };
}

export const getLiveQueue = () => api.get<QueueAppointment[]>('/appointments/queue').then((r) => r.data);

export interface QueueStats {
  totalInQueue: number;
  waitingOver30: number;
  inConsultation: number;
  completedToday: number;
  avgWaitingTimeMinutes: number;
  longestWaitingTimeMinutes: number;
  waitingCount: number;
  calledCount: number;
}

export const getQueueStats = () => api.get<QueueStats>('/appointments/queue/stats').then((r) => r.data);

export type AppointmentStatus = 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped' | 'Cancelled' | 'No Show';

export const updateAppointmentStatus = (appointmentId: number, status: AppointmentStatus, reason?: string) =>
  api.patch(`/appointments/${appointmentId}/status`, { status, reason }).then((r) => r.data);

export const skipAppointment = (appointmentId: number, reason: string) => api.patch(`/appointments/${appointmentId}/skip`, { reason }).then((r) => r.data);

export interface BoardCard {
  appointment_id: number;
  token: number;
  patient_id: string;
  patient_name: string;
  dob: string;
  gender: string;
  phone: string | null;
  doctor_id: number;
  doctor_name: string;
  scheduled_at: string;
  status: AppointmentStatus;
  is_walk_in: boolean;
  visit_type: string;
  priority: string;
  since: string | null;
  completed_at: string | null;
}

export interface QueueBoard {
  waiting: BoardCard[];
  upcoming: BoardCard[];
  withDoctor: BoardCard[];
  inPharmacy: BoardCard[];
  completedToday: BoardCard[];
  skipped: BoardCard[];
  isToday: boolean;
}

export interface QueueBoardParams {
  doctorId?: number;
  consultationType?: string;
  date?: string;
}

export const getQueueBoard = (params?: QueueBoardParams) => api.get<QueueBoard>('/appointments/board', { params }).then((r) => r.data);

export interface QueueLogEntry {
  log_id: number;
  appointment_id: number;
  action: 'Skipped' | 'Recalled';
  reason: string | null;
  created_at: string;
  actor: { username: string; role: string };
  appointment: {
    appointment_id: number;
    scheduled_at: string;
    visit_type: string;
    consultation_type: string | null;
    priority: string;
    is_walk_in: boolean;
    patient: { full_name: string; patient_id: string; gender: string; dob: string; phone: string | null };
    doctor: { user_id: number; username: string; registration_number: string | null };
  };
}

export interface QueueLogParams {
  dateFrom?: string;
  dateTo?: string;
  doctorId?: number;
  consultationType?: string;
  action?: 'Skipped' | 'Recalled';
  search?: string;
  page?: number;
  limit?: number;
}

export const listQueueLog = (params: QueueLogParams) =>
  api.get<{ data: QueueLogEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('/appointments/queue-log', { params }).then((r) => r.data);
