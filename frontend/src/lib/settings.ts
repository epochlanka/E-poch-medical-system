import { api } from './api';

export interface MasterDataItem {
  item_id: number;
  type: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export const listMasterData = (type: string, includeInactive = false) =>
  api.get<MasterDataItem[]>('/settings/master-data', { params: { type, includeInactive: includeInactive ? 'true' : undefined } }).then((r) => r.data);

export const createMasterDataItem = (input: { type: string; value: string; sort_order?: number }) =>
  api.post<MasterDataItem>('/settings/master-data', input).then((r) => r.data);

export const updateMasterDataItem = (itemId: number, input: { value?: string; sort_order?: number; is_active?: boolean }) =>
  api.put<MasterDataItem>(`/settings/master-data/${itemId}`, input).then((r) => r.data);

export const deleteMasterDataItem = (itemId: number) => api.delete(`/settings/master-data/${itemId}`);

// ---- Clinic Settings ------------------------------------------------------------------------

export interface ClinicSettings {
  id: number;
  clinic_name: string;
  clinic_address: string | null;
  registration_number: string | null;
  logo_url: string | null;
  default_consultation_fee: number;
  expiry_alert_threshold_days: number;
  session_timeout_minutes: number;
  account_lockout_minutes: number;
  updated_by: number | null;
  updated_at: string;
  updater: { username: string } | null;
}

export const getClinicSettings = () => api.get<ClinicSettings>('/settings').then((r) => r.data);

export interface UpdateClinicSettingsInput {
  clinic_name?: string;
  clinic_address?: string;
  registration_number?: string;
  logo_url?: string;
  default_consultation_fee?: number;
  expiry_alert_threshold_days?: number;
  session_timeout_minutes?: number;
  account_lockout_minutes?: number;
}

export const updateClinicSettings = (input: UpdateClinicSettingsInput) => api.put<ClinicSettings>('/settings', input).then((r) => r.data);

// ---- Backup & Restore -----------------------------------------------------------------------

export interface DbBackup {
  backup_id: number;
  filename: string;
  size_bytes: number;
  created_at: string;
  verified: boolean;
  verified_at: string | null;
  creator: { username: string };
}

export const createBackup = () => api.post<DbBackup>('/settings/backups').then((r) => r.data);
export const listBackups = () => api.get<DbBackup[]>('/settings/backups').then((r) => r.data);
export const verifyBackup = (backupId: number) => api.post<DbBackup>(`/settings/backups/${backupId}/verify`).then((r) => r.data);

export interface RestoreResult {
  restoredFromBackupId: number;
  restoredFilename: string;
  warning: string;
}

export const restoreBackup = (backupId: number) => api.post<RestoreResult>(`/settings/backups/${backupId}/restore`).then((r) => r.data);

export const downloadBackup = async (backupId: number, filename: string) => {
  const res = await api.get(`/settings/backups/${backupId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
