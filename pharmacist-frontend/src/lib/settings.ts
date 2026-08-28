import { api } from './api';

export interface ClinicSettings {
  clinic_name: string;
  clinic_address: string | null;
}

export const getClinicSettings = () => api.get<ClinicSettings>('/settings').then((r) => r.data);
