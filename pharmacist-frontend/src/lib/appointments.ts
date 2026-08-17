import { api } from './api';

export interface Doctor {
  user_id: number;
  username: string;
  registration_number: string | null;
}

export const getDoctors = (search?: string) => api.get<{ data: Doctor[] }>('/appointments/doctors', { params: { search } }).then((r) => r.data.data);
