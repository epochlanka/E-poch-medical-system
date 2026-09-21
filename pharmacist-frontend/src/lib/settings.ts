import { api } from './api';

export interface ClinicSettings {
  clinic_name: string;
  clinic_address: string | null;
}

export const getClinicSettings = () => api.get<ClinicSettings>('/settings').then((r) => r.data);

export interface MasterDataItem {
  item_id: number;
  type: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export const listMasterData = (type: string) => api.get<MasterDataItem[]>('/settings/master-data', { params: { type } }).then((r) => r.data);
