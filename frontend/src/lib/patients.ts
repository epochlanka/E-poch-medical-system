import { api } from './api';

export interface RegisterPatientInput {
  full_name: string;
  dob: string;
  gender: string;
  nic?: string;
  guardian_nic?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  new_family: { family_name: string; address?: string; contact_no?: string };
}

export const registerPatient = (input: RegisterPatientInput) =>
  api.post('/patients', input).then((r) => r.data);
