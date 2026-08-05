import type { AppointmentStatus } from '../../lib/appointments';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const appointmentCode = (appointmentId: number, scheduledAt: string) =>
  `APT-${new Date(scheduledAt).getFullYear()}-${String(appointmentId).padStart(5, '0')}`;

export const STATUS_BADGE: Record<AppointmentStatus, string> = {
  Waiting: 'badge-blue',
  Called: 'badge-purple',
  Consulting: 'badge-amber',
  Completed: 'badge-green',
  Skipped: 'badge-gray',
  Cancelled: 'badge-red',
  'No Show': 'badge-gray',
};

export const ACTIVE_STATUSES: AppointmentStatus[] = ['Waiting', 'Called', 'Consulting'];
