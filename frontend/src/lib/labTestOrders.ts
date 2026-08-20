import { api } from './api';

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
  report_received_by_user?: LabTestOrderUserRef | null;
  completed_by_user?: LabTestOrderUserRef | null;
  results?: LabResult[];
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

export const getLabTestCatalogParameters = (testId: number) =>
  api.get<LabTestParameter[]>(`/lab-test-orders/catalog/${testId}/parameters`).then((r) => r.data);

export interface ListLabTestOrdersParams {
  patientId?: string;
  doctorId?: number;
  status?: LabTestOrderStatus;
  priority?: LabTestOrderPriority;
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

// Reception/Admin — records the physical report is back, no clinical values involved.
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

// Admin only in this app (Reception is excluded from clinical entry/finalization by role).
export const completeLabResult = (id: number, input: CompleteLabResultInput) => api.post<LabTestOrder>(`/lab-test-orders/${id}/complete`, input);
export const amendLabResult = (id: number, input: CompleteLabResultInput) => api.put<LabTestOrder>(`/lab-test-orders/${id}/complete`, input);

export const printLabTestOrder = async (id: number) => {
  const res = await api.get(`/lab-test-orders/${id}/print`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};

export const printLabResultReport = async (id: number) => {
  const res = await api.get(`/lab-test-orders/${id}/result-print`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};
