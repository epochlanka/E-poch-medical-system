import { api } from './api';

export interface Alert {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch' | 'skipped-appointment';
  severity: 'red' | 'amber';
  message: string;
  refId: number | string;
}

export const getAlerts = () => api.get<Alert[]>('/dashboard/alerts').then((r) => r.data);

export interface PharmacistDashboardKpis {
  prescriptionsInQueue: number;
  pendingCount: number;
  preparingCount: number;
  dispensedTodayPrescriptions: number;
  dispensedTodayItems: number;
  lowStockItemsCount: number;
  expiringBatchesCount: number;
  todaysSalesPharmacy: number;
  todaysSalesChangePct: number | null;
}

export interface PharmacyQueueOverview {
  pending: number;
  preparing: number;
  dispensedToday: number;
  collectedToday: number;
  total: number;
}

export interface DispensingTrendPoint {
  date: string;
  label: string;
  itemsDispensed: number;
}

export interface PharmacistAlertSummary {
  veryLowStockCount: number;
  lowStockCount: number;
  expiringWithin30Count: number;
  expiringWithin31To90Count: number;
}

export interface ExpiringBatchRow {
  batchId: number;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  daysLeft: number;
  qtyOnHand: number;
  alertLevel: 'High' | 'Medium' | 'Low';
}

export interface TopDispensedRow {
  medicineId: number;
  medicineName: string;
  qtyDispensed: number;
}

export interface PharmacistOverview {
  kpis: PharmacistDashboardKpis;
  queueOverview: PharmacyQueueOverview;
  dispensingTrend: DispensingTrendPoint[];
  alertSummary: PharmacistAlertSummary;
  expiringBatches: ExpiringBatchRow[];
  topDispensedToday: TopDispensedRow[];
}

export const getPharmacistOverview = () => api.get<PharmacistOverview>('/dashboard/pharmacist-overview').then((r) => r.data);
