import { api } from './api';

// Real state transition (Pending -> Preparing) backing the "Start Dispensing" action — the
// actual dispense/batch-allocation screen is a separate not-yet-built page (Dispensing).
export const setPrescriptionPreparing = (prescriptionId: number) => api.post(`/pharmacy/prescriptions/${prescriptionId}/preparing`).then((r) => r.data);
