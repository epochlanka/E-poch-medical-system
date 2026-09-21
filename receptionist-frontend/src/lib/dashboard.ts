import { api } from './api';

export interface Alert {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch' | 'skipped-appointment';
  severity: 'red' | 'amber';
  message: string;
  refId: number | string;
}

export const getAlerts = () => api.get<Alert[]>('/dashboard/alerts').then((r) => r.data);

export interface ReceptionistDashboardKpis {
  todaysAppointmentsTotal: number;
  todaysAppointmentsChangePct: number | null;
  walkInPatientsToday: number;
  walkInPatientsChangePct: number | null;
  patientsSeenToday: number;
  patientsSeenChangePct: number | null;
  invoicesGeneratedToday: number;
  invoicesGeneratedChangePct: number | null;
  totalCollectionsToday: number;
  totalCollectionsChangePct: number | null;
  avgWaitingTimeMinutes: number;
}

export type QueueStatus = 'Waiting' | 'With Doctor' | 'With Pharmacy' | 'Completed';

export interface QueueEntry {
  appointmentId: number;
  patientId: string;
  patientName: string;
  photoUrl: string | null;
  type: 'Appointment' | 'Walk-in';
  doctorId: number;
  doctorName: string;
  token: string;
  status: QueueStatus;
  waitTimeMinutes: number | null;
  scheduledAt: string;
}

export interface QueueCounts {
  all: number;
  waiting: number;
  withDoctor: number;
  withPharmacy: number;
  completed: number;
}

export interface ScheduleSlot {
  time: string;
  doctorId: number;
  doctorName: string;
  appointmentCount: number;
  status: 'In Progress' | 'Upcoming';
}

export interface WeeklyOverviewDay {
  date: string;
  appointments: number;
  walkIns: number;
  patientsSeen: number;
}

export interface RecentActivityEntry {
  logId: number;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
}

export interface ReceptionistDashboard {
  kpis: ReceptionistDashboardKpis;
  queueCounts: QueueCounts;
  todaysQueue: QueueEntry[];
  todaysSchedule: ScheduleSlot[];
  weeklyOverview: WeeklyOverviewDay[];
  recentActivity: RecentActivityEntry[];
}

export const getReceptionistDashboard = () => api.get<ReceptionistDashboard>('/dashboard/receptionist-overview').then((r) => r.data);
