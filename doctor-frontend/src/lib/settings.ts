import { api } from './api';

export interface MasterDataItem {
  item_id: number;
  type: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export const listMasterData = (type: string) => api.get<MasterDataItem[]>('/settings/master-data', { params: { type } }).then((r) => r.data);
