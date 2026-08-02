import { api } from './api';

export interface QueueAppointment {
  appointment_id: number;
  patient_id: string;
  doctor_id: number;
  scheduled_at: string;
  status: 'Waiting' | 'Called' | 'Consulting' | 'Completed' | 'Skipped';
  patient: { full_name: string; gender: string; dob: string };
  doctor: { username: string };
}

export const getLiveQueue = () => api.get<QueueAppointment[]>('/appointments/queue').then((r) => r.data);

export const updateAppointmentStatus = (appointmentId: number, status: QueueAppointment['status']) =>
  api.patch(`/appointments/${appointmentId}/status`, { status }).then((r) => r.data);
