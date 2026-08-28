import { api } from './api';
import type { ConsultationPatient } from './consultations';

export type LabTestOrderPriority = 'Routine' | 'Urgent' | 'STAT';
export type LabTestOrderStatus = 'Pending' | 'Report Received' | 'Completed' | 'Cancelled';

export interface LabTestOrderPatientRef {
  patient_id: string;
  full_name: string;
  gender: string;
  dob: string;
}

export interface LabTestOrderUserRef {
  user_id: number;
  username: string;
}

export interface LabResult {
  result_id: number;
  lab_test_order_id: number;
  parameter_id: number | null;
  parameter_name: string;
  unit: string | null;
  reference_range: string | null;
  result_value: string;
  result_flag: 'Normal' | 'Low' | 'High' | null;
  entered_by: number;
  entered_at: string;
}

export interface LabTestOrder {
  lab_test_order_id: number;
  patient_id: string;
  doctor_id: number;
  consultation_id: number;
  catalog_test_id: number | null;
  test_name: string;
  test_category: string | null;
  instructions: string | null;
  priority: LabTestOrderPriority;
  additional_notes: string | null;
  request_number: string | null;
  status: LabTestOrderStatus;
  order_date: string;
  printed_at: string | null;
  report_received_at: string | null;
  received_note: string | null;
  interpretation: string | null;
  completed_at: string | null;
  report_file_path: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  patient?: LabTestOrderPatientRef;
  doctor?: LabTestOrderUserRef & { registration_number: string | null };
  printed_by_user?: LabTestOrderUserRef | null;
  report_received_by_user?: LabTestOrderUserRef | null;
  completed_by_user?: LabTestOrderUserRef | null;
  consultation?: { consultation_id: number; diagnosis: string | null };
  results?: LabResult[];
}

export interface LabTestCatalogEntry {
  test_id: number;
  test_name: string;
  test_code: string | null;
  category: string | null;
  abbreviation: string | null;
  is_active: boolean;
}

export interface LabTestParameter {
  parameter_id: number;
  test_id: number;
  parameter_name: string;
  unit: string | null;
  reference_range: string | null;
  display_order: number;
  data_type: 'Numeric' | 'Text';
  is_active: boolean;
}

export const searchLabTestCatalog = (search?: string) =>
  api.get<LabTestCatalogEntry[]>('/lab-test-orders/catalog', { params: { search } }).then((r) => r.data);

export const getLabTestCatalogParameters = (testId: number) =>
  api.get<LabTestParameter[]>(`/lab-test-orders/catalog/${testId}/parameters`).then((r) => r.data);

export interface CreateLabTestOrderInput {
  consultation_id: number;
  catalog_test_id?: number;
  test_name?: string;
  test_category?: string;
  instructions?: string;
  priority?: LabTestOrderPriority;
  additional_notes?: string;
}

export const createLabTestOrder = (input: CreateLabTestOrderInput) => api.post<LabTestOrder>('/lab-test-orders', input);

export interface LabTestOrderContext {
  consultation: { consultationId: number; status: string; diagnosis: string | null };
  appointment: {
    appointmentId: number;
    scheduledAt: string;
    patient: ConsultationPatient;
    doctor: { user_id: number; username: string; registration_number: string | null };
  };
}

export const getLabTestOrderContext = (consultationId: number) =>
  api.get<LabTestOrderContext>(`/lab-test-orders/context/${consultationId}`).then((r) => r.data);

export interface ListLabTestOrdersParams {
  patientId?: string;
  doctorId?: number;
  consultationId?: number;
  status?: LabTestOrderStatus;
  priority?: LabTestOrderPriority;
  testId?: number;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listLabTestOrders = (params: ListLabTestOrdersParams) =>
  api.get<{ data: LabTestOrder[]; pagination: Pagination }>('/lab-test-orders', { params }).then((r) => r.data);

export const getLabTestOrder = (id: number) => api.get<LabTestOrder>(`/lab-test-orders/${id}`).then((r) => r.data);

// Reception/Doctor/Admin — records the physical report is back, no clinical values involved.
export const markReportReceived = (id: number, note?: string, reportFile?: File | null) => {
  const form = new FormData();
  if (note) form.append('note', note);
  if (reportFile) form.append('report', reportFile);
  return api.post<LabTestOrder>(`/lab-test-orders/${id}/received`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export interface ResultParameterInput {
  parameter_id?: number;
  parameter_name: string;
  unit?: string;
  reference_range?: string;
  result_value: string;
}

export interface CompleteLabResultInput {
  results: ResultParameterInput[];
  doctor_notes?: string;
  interpretation?: string;
}

// Doctor/Admin only — the single "enter values + review + finalize" action.
export const completeLabResult = (id: number, input: CompleteLabResultInput) => api.post<LabTestOrder>(`/lab-test-orders/${id}/complete`, input);

// Amend a already-Completed order's values (still Doctor/Admin only, status stays Completed).
export const amendLabResult = (id: number, input: CompleteLabResultInput) => api.put<LabTestOrder>(`/lab-test-orders/${id}/complete`, input);

export const cancelLabTestOrder = (id: number) => api.post<LabTestOrder>(`/lab-test-orders/${id}/cancel`);

// Fetches the printable request as an authenticated blob (the print route requires a bearer
// token, so a plain <a href> / window.open(url) can't hit it directly) and opens it in a new
// tab for the browser's own print/view UI, rather than forcing a download.
export const printLabTestOrder = async (id: number) => {
  const res = await api.get(`/lab-test-orders/${id}/print`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};

// Document 2 — the completed result/review report, separate from the request letter above.
export const printLabResultReport = async (id: number) => {
  const res = await api.get(`/lab-test-orders/${id}/result-print`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};
