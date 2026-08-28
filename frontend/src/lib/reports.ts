import { api } from './api';

export interface DateRangeParams {
  from?: string;
  to?: string;
}

// ---- Overview -----------------------------------------------------------------------------

export interface OverviewKpis {
  totalPatients: number;
  totalPatientsChangePct: number | null;
  appointments: number;
  appointmentsChangePct: number | null;
  consultations: number;
  consultationsChangePct: number | null;
  prescriptions: number;
  prescriptionsChangePct: number | null;
  totalRevenue: number;
  totalRevenueChangePct: number | null;
}

export interface RevenueByCategory {
  categories: { label: string; value: number }[];
  subtotalBilled: number;
  discountTotal: number;
  netRevenue: number;
}

export interface OverviewStats {
  newPatients: number;
  newPatientsChangePct: number | null;
  medicineSales: number;
  medicineSalesChangePct: number | null;
  avgBillValue: number;
  avgBillValueChangePct: number | null;
  collections: number;
  collectionsChangePct: number | null;
}

export interface TopDoctor {
  doctorId: number;
  doctorName: string;
  consultations: number;
  patients: number;
  revenue: number;
}

export interface OverviewReport {
  title: string;
  range: { from: string; to: string };
  kpis: OverviewKpis;
  revenueTrend: { date: string; total: number }[];
  revenueByCategory: RevenueByCategory;
  stats: OverviewStats;
  topDoctors: TopDoctor[];
  patientDemographics: { label: string; count: number }[];
  alerts: { lowStockCount: number; expiringSoonCount: number; outstandingInvoicesCount: number };
  recentActivity: { logId: number; timestamp: string; username: string; role: string; action: string; entity: string; entityId: string }[];
}

export const getOverviewReport = (params: DateRangeParams) => api.get<OverviewReport>('/reports/overview', { params }).then((r) => r.data);

// ---- Generic report shape (the 9 existing granular report endpoints) ----------------------

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportResult {
  title: string;
  range: { from?: string; to?: string };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export type ReportFormat = 'json' | 'csv' | 'pdf';

export interface ReportParamSpec {
  dateRange?: boolean;
  limit?: boolean;
  days?: boolean;
  doctorId?: boolean;
  auditFilters?: boolean;
}

export interface ReportDefinition {
  key: string;
  label: string;
  tab: 'patient' | 'financial' | 'pharmacy' | 'inventory' | 'operational';
  path: string;
  params: ReportParamSpec;
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { key: 'patient-volume', label: 'Daily Patient Volume', tab: 'patient', path: '/reports/patient-volume', params: { dateRange: true } },
  { key: 'doctor-consultations', label: 'Consultation Counts by Doctor', tab: 'patient', path: '/reports/doctor/consultations', params: { dateRange: true, doctorId: true } },
  { key: 'follow-ups-due', label: 'Follow-ups Due', tab: 'patient', path: '/reports/doctor/follow-ups-due', params: {} },
  { key: 'revenue', label: 'Revenue by Payment Method', tab: 'financial', path: '/reports/revenue', params: { dateRange: true } },
  { key: 'top-medicines', label: 'Top Dispensed Medicines', tab: 'financial', path: '/reports/top-medicines', params: { dateRange: true, limit: true } },
  { key: 'dispensing-volume', label: 'Dispensing Volume', tab: 'pharmacy', path: '/reports/pharmacist/dispensing-volume', params: { dateRange: true } },
  { key: 'low-stock', label: 'Low Stock Medicines', tab: 'inventory', path: '/reports/pharmacist/low-stock', params: {} },
  { key: 'expiring-batches', label: 'Expiring & Expired Batches', tab: 'inventory', path: '/reports/pharmacist/expiring-batches', params: { days: true } },
  { key: 'audit-log', label: 'Audit Log Search', tab: 'operational', path: '/reports/audit-log', params: { dateRange: true, auditFilters: true } },
];

export const getReport = (path: string, params: Record<string, unknown>) => api.get<ReportResult>(path, { params }).then((r) => r.data);

// ---- CSV/PDF export -------------------------------------------------------------------------
// Streams the real backend-generated file (same csv/pdf renderer used by every report) and
// triggers a normal browser download — no data is fabricated client-side.

const filenameFromDisposition = (disposition: string | undefined, fallback: string) => {
  const match = disposition?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallback;
};

export const downloadReport = async (path: string, params: Record<string, unknown>, format: 'csv' | 'pdf') => {
  const res = await api.get(path, { params: { ...params, format }, responseType: 'blob' });
  const fallback = `report.${format}`;
  const filename = filenameFromDisposition(res.headers['content-disposition'], fallback);
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
