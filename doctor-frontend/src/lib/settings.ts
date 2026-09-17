import { api } from './api';

export interface ClinicSettings {
  id: number;
  clinic_name: string;
  default_consultation_fee: number;
}

// Read-only here — only Admin can PUT changes (Settings module). Used to show the current
// clinic-wide default fee as a hint on the consultation-completion screen.
export const getClinicSettings = () => api.get<ClinicSettings>('/settings').then((r) => r.data);

export interface MasterDataItem {
  item_id: number;
  type: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export const listMasterData = (type: string) => api.get<MasterDataItem[]>('/settings/master-data', { params: { type } }).then((r) => r.data);
