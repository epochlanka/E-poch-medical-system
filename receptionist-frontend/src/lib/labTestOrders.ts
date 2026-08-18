import { api } from './api';

export type LabTestOrderPriority = 'Routine' | 'Urgent' | 'STAT';
export type LabTestOrderStatus = 'Pending' | 'Result Received' | 'Reviewed' | 'Cancelled';

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

export interface LabTestOrder {
  lab_test_order_id: number;
  patient_id: string;
  doctor_id: number;
  consultation_id: number;
  test_name: string;
  test_category: string | null;
  instructions: string | null;
  priority: LabTestOrderPriority;
  additional_notes: string | null;
  status: LabTestOrderStatus;
  order_date: string;
  result_value: string | null;
  unit: string | null;
  reference_range: string | null;
  result_notes: string | null;
  result_date: string | null;
  laboratory_name: string | null;
  report_file_path: string | null;
  entered_by: number | null;
  entered_at: string | null;
  reviewed_by: number | null;
  review_notes: string | null;
  reviewed_date: string | null;
  created_at: string;
  updated_at: string;
  patient?: LabTestOrderPatientRef;
  doctor?: LabTestOrderUserRef & { registration_number: string | null };
  entered_by_user?: LabTestOrderUserRef | null;
  reviewed_by_user?: LabTestOrderUserRef | null;
}

export interface ListLabTestOrdersParams {
  patientId?: string;
  doctorId?: number;
  status?: LabTestOrderStatus;
  priority?: LabTestOrderPriority;
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

export interface EnterLabResultInput {
  result_value: string;
  unit?: string;
  reference_range?: string;
  result_date?: string;
  result_notes?: string;
  laboratory_name?: string;
  report?: File | null;
}

export const enterLabResult = (id: number, input: EnterLabResultInput) => {
  const form = new FormData();
  form.append('result_value', input.result_value);
  if (input.unit) form.append('unit', input.unit);
  if (input.reference_range) form.append('reference_range', input.reference_range);
  if (input.result_date) form.append('result_date', input.result_date);
  if (input.result_notes) form.append('result_notes', input.result_notes);
  if (input.laboratory_name) form.append('laboratory_name', input.laboratory_name);
  if (input.report) form.append('report', input.report);
  return api.post<LabTestOrder>(`/lab-test-orders/${id}/result`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
