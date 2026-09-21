import { api } from './api';

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
}

export type ReportKind =
  | 'consultations'
  | 'diagnoses'
  | 'patient-visits'
  | 'prescriptions'
  | 'top-medicines'
  | 'follow-ups-due'
  | 'appointments'
  | 'clinical-statistics';

export interface ReportDef {
  kind: ReportKind;
  name: string;
  description: string;
  type: 'Summary' | 'Analytics' | 'Operational';
  rangeScoped: boolean;
}

// Every one of these maps to a real doctor-scoped backend report (backend/src/modules/reports) —
// no report here is fabricated or tracks something the data model doesn't actually record.
export const REPORT_DEFS: ReportDef[] = [
  { kind: 'consultations', name: 'Consultation Summary', description: 'Daily count of your finalized consultations.', type: 'Summary', rangeScoped: true },
  { kind: 'diagnoses', name: 'Consultations by Diagnosis', description: 'Diagnosis breakdown across your consultations.', type: 'Analytics', rangeScoped: true },
  { kind: 'patient-visits', name: 'Patient Visit Frequency', description: 'Your patients grouped by number of visits.', type: 'Analytics', rangeScoped: true },
  { kind: 'prescriptions', name: 'Prescriptions Summary', description: 'Daily count of prescriptions you issued.', type: 'Summary', rangeScoped: true },
  { kind: 'top-medicines', name: 'Top Prescribed Medicines', description: 'Medicines you prescribe most often.', type: 'Analytics', rangeScoped: true },
  { kind: 'follow-ups-due', name: 'Follow-ups Due Report', description: 'Patients with a follow-up due, as of today.', type: 'Operational', rangeScoped: false },
  { kind: 'appointments', name: 'Appointment Summary', description: 'Your appointments by status and attendance.', type: 'Summary', rangeScoped: true },
];

const ENDPOINT: Record<ReportKind, string> = {
  consultations: '/reports/doctor/consultations',
  diagnoses: '/reports/doctor/diagnoses',
  'patient-visits': '/reports/doctor/patient-visits',
  prescriptions: '/reports/doctor/prescriptions',
  'top-medicines': '/reports/doctor/top-medicines',
  'follow-ups-due': '/reports/doctor/follow-ups-due',
  appointments: '/reports/doctor/appointments',
  'clinical-statistics': '/reports/doctor/clinical-statistics',
};

export interface ReportParams {
  from?: string;
  to?: string;
}

export const getReport = (kind: ReportKind, params: ReportParams) => api.get<ReportResult>(ENDPOINT[kind], { params }).then((r) => r.data);

export const downloadReport = async (kind: ReportKind, params: ReportParams, format: 'csv' | 'pdf', fileName: string) => {
  const res = await api.get(ENDPOINT[kind], { params: { ...params, format }, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export interface ClinicalStatistics {
  title: string;
  range: { from: string; to: string };
  kpis: {
    totalConsultations: number;
    priorTotalConsultations: number;
    totalConsultationsChangePct: number | null;
    newPatients: number;
    priorNewPatients: number;
    newPatientsChangePct: number | null;
    prescriptionsIssued: number;
    priorPrescriptionsIssued: number;
    prescriptionsIssuedChangePct: number | null;
    followUpsScheduled: number;
    priorFollowUpsScheduled: number;
    followUpsScheduledChangePct: number | null;
    avgConsultationSeconds: number;
    priorAvgConsultationSeconds: number;
    avgConsultationSecondsChangePct: number | null;
  };
  consultationsTrend: { date: string; count: number }[];
  appointmentOutcomes: { status: string; count: number }[];
  patientDemographics: { label: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number; percentage: number }[];
}

export const getClinicalStatistics = (params: ReportParams) =>
  api.get<ClinicalStatistics>('/reports/doctor/clinical-statistics', { params }).then((r) => r.data);
