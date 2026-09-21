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

// Exactly one identity path: a registered patient_id, OR is_temporary + temp_patient_name for a
// "Continue Without Registration" walk-in (see backend/src/modules/appointments/router.ts).
export interface CreateAppointmentInput {
  patient_id?: string;
  is_temporary?: boolean;
  temp_patient_name?: string;
  temp_patient_gender?: string;
  temp_patient_phone?: string;
  temp_patient_age?: number;
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

export const convertToPatient = (appointmentId: number, patientId: string) =>
  api.patch(`/appointments/${appointmentId}/convert-to-patient`, { patient_id: patientId }).then((r) => r.data);

export interface QueueAppointment {
  appointment_id: number;
  scheduled_at: string;
  status: string;
  priority?: string;
  is_walk_in: boolean;
  // A temporary/unregistered walk-in has patient: null — fall back to temp_patient_* for display.
  is_temporary: boolean;
  temp_patient_name: string | null;
  temp_patient_gender: string | null;
  temp_patient_phone: string | null;
  temp_patient_age: number | null;
  patient: { full_name: string; patient_id: string } | null;
  doctor: { user_id: number; username: string; registration_number: string | null };
}

// Resolve a display name/id for a queue row regardless of whether it's a registered patient or a
// temporary walk-in — use this instead of reading `.patient.*` directly anywhere a queue row is rendered.
export const displayPatientName = (a: Pick<QueueAppointment, 'patient' | 'temp_patient_name'>) =>
  a.patient?.full_name ?? a.temp_patient_name ?? 'Unregistered Patient';
export const displayPatientId = (a: Pick<QueueAppointment, 'patient' | 'is_temporary'>) =>
  a.patient?.patient_id ?? (a.is_temporary ? 'Temporary' : '—');

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
  // Null patient_id/dob means this is a temporary/unregistered walk-in — patient_name already
  // falls back to temp_patient_name server-side (see getQueueBoard in appointments/service.ts).
  patient_id: string | null;
  patient_name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  is_temporary: boolean;
  temp_patient_age: number | null;
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
    is_temporary: boolean;
    temp_patient_name: string | null;
    temp_patient_gender: string | null;
    temp_patient_phone: string | null;
    patient: { full_name: string; patient_id: string; gender: string; dob: string; phone: string | null } | null;
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
