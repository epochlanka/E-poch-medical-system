import { api } from './api';

export interface ExternalMedicineInput {
  medicine_id?: number;
  medicine_name?: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form: string;
  strength?: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  quantity: number;
  quantity_unit: string;
  instructions?: string;
}

export interface ExternalMedicine {
  extItemId: number;
  prescriptionId: number;
  patientId: string;
  doctorId: number;
  medicineId: number | null;
  medicineName: string;
  genericName: string | null;
  brandName: string | null;
  dosageForm: string;
  strength: string | null;
  dosage: string;
  frequency: string | null;
  duration: string | null;
  quantity: number;
  quantityUnit: string;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreviousExternalMedicine extends ExternalMedicine {
  lastPrescribedAt: string;
}

export const createExternalMedicine = (prescriptionId: number, input: ExternalMedicineInput) =>
  api.post<ExternalMedicine>(`/external-medicines/prescription/${prescriptionId}`, input).then((r) => r.data);

export const bulkCreateExternalMedicines = (prescriptionId: number, items: ExternalMedicineInput[]) =>
  api.post<ExternalMedicine[]>(`/external-medicines/prescription/${prescriptionId}/bulk`, { items }).then((r) => r.data);

export const listExternalMedicinesByPrescription = (prescriptionId: number) =>
  api.get<ExternalMedicine[]>(`/external-medicines/prescription/${prescriptionId}`).then((r) => r.data);

// "Super search" over a patient's previous external medicines, for the "Use Again" flow.
export const searchPreviousExternalMedicines = (patientId: string, search: string) =>
  api.get<PreviousExternalMedicine[]>(`/external-medicines/patient/${patientId}`, { params: { search } }).then((r) => r.data);

export const updateExternalMedicine = (extItemId: number, updates: Partial<ExternalMedicineInput>) =>
  api.put<ExternalMedicine>(`/external-medicines/${extItemId}`, updates).then((r) => r.data);

export const deleteExternalMedicine = (extItemId: number) => api.delete(`/external-medicines/${extItemId}`);

// Same "open the PDF in a new tab" pattern as downloadExternalPurchaseSlip in prescriptions.ts —
// the browser's own PDF viewer serves as the preview before the doctor prints it.
export const previewExternalMedicineSlip = async (prescriptionId: number) => {
  const res = await api.get(`/external-medicines/prescription/${prescriptionId}/slip`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank');
};
