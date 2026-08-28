import { api } from './api';

// Real state transition (Pending -> Preparing) backing the "Start Dispensing" action — the
// actual dispense/batch-allocation screen is a separate not-yet-built page (Dispensing).
export const setPrescriptionPreparing = (prescriptionId: number) => api.post(`/pharmacy/prescriptions/${prescriptionId}/preparing`).then((r) => r.data);

// Dispensed -> Collected, the explicit "handed to patient" action (never auto-advanced).
export const collectPrescription = (prescriptionId: number) => api.post(`/pharmacy/prescriptions/${prescriptionId}/collect`).then((r) => r.data);

export type QueueStatus = 'Pending' | 'Preparing' | 'Dispensed' | 'Collected';

export interface QueueItem {
  prescriptionId: number;
  code: string;
  status: QueueStatus;
  isRefill: boolean;
  issuedAt: string;
  lastActivityAt: string;
  patientId: string;
  patientName: string;
  doctorId: number;
  doctorName: string;
  consultationType: string | null;
  itemCount: number;
  pendingItemCount: number;
  items: { rxItemId: number; medicine: string; qty: number; dispensed: boolean }[];
}

export type QueueBoard = Record<QueueStatus, QueueItem[]>;

// Full board (all four statuses) — the pharmacy Queue page's data source; small enough in
// practice that client-side search/filter over the fetched board is simpler than adding
// server-side query params for what's essentially a same-day working queue.
export const getPharmacyQueue = () => api.get<QueueBoard>('/pharmacy/queue').then((r) => r.data);

export interface BatchOption {
  batchId: number;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
}

export interface BatchSuggestion {
  rxItemId: number;
  medicineId: number;
  medicineName: string;
  qtyNeeded: number;
  suggestedBatchId: number | null;
  batches: BatchOption[];
}

// FEFO-sorted batch options per still-undispensed, non-external line. Fully external-purchase
// lines (external_qty >= qty) never appear here — they need no batch at all.
export const getBatchSuggestions = (prescriptionId: number) =>
  api.get<BatchSuggestion[]>(`/pharmacy/prescriptions/${prescriptionId}/batch-suggestions`).then((r) => r.data);

export interface DispenseItemInput {
  rx_item_id: number;
  batch_id?: number;
  qty?: number; // omit to dispense the item's full remaining balance; set for a genuine partial draw
  override_reason?: string;
  notes?: string;
  substitute_medicine_id?: number;
}

// The real FEFO dispense — batch_id is omitted for fully external-purchase lines (the backend
// stamps those done without touching stock). Partial dispense is inherent: only the items in
// this payload advance, the rest stay Pending/Preparing for a later pass.
export const dispensePrescription = (prescriptionId: number, items: DispenseItemInput[]) =>
  api.post(`/pharmacy/prescriptions/${prescriptionId}/dispense`, { items }).then((r) => r.data);

export type SubstitutionType = 'Auto' | 'Manual';
export type SubstitutionStatusFilter = 'all' | 'active' | 'inactive';

export interface SubstitutionRule {
  substitutionId: number;
  medicineId: number;
  medicineName: string;
  substituteMedicineId: number;
  substituteMedicineName: string;
  therapeuticClass: string | null;
  priority: number;
  type: SubstitutionType;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface SubstitutionStats {
  total: number;
  active: number;
  inactive: number;
  autoCount: number;
  manualCount: number;
}

export const getSubstitutionStats = () => api.get<SubstitutionStats>('/pharmacy/substitutions/stats').then((r) => r.data);

export const listSubstitutions = (params?: { medicineId?: number; status?: SubstitutionStatusFilter }) =>
  api.get<SubstitutionRule[]>('/pharmacy/substitutions', { params }).then((r) => r.data);

export interface CreateSubstitutionInput {
  medicine_id: number;
  substitute_medicine_id: number;
  priority?: number;
  type?: SubstitutionType;
}

export const createSubstitution = (input: CreateSubstitutionInput) => api.post('/pharmacy/substitutions', input).then((r) => r.data);

export interface UpdateSubstitutionInput {
  priority?: number;
  type?: SubstitutionType;
  is_active?: boolean;
}

export const updateSubstitution = (substitutionId: number, input: UpdateSubstitutionInput) =>
  api.patch(`/pharmacy/substitutions/${substitutionId}`, input).then((r) => r.data);

// Same "PDF route only accepts a Bearer header" gotcha as the prescription PDF — blob-fetch
// through the authenticated axios instance rather than a bare link.
export const downloadDispenseLabel = async (prescriptionId: number, code: string) => {
  const res = await api.get(`/pharmacy/prescriptions/${prescriptionId}/label`, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}-label.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
