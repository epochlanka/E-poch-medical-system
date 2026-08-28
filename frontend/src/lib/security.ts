import { api } from './api';

export const ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] as const;
export type Role = (typeof ROLES)[number];

export interface SecurityUser {
  user_id: number;
  username: string;
  role: Role;
  registration_number: string | null;
  is_active: boolean;
  totp_enabled: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
}

export const listUsers = (includeInactive = true) =>
  api.get<SecurityUser[]>('/security/users', { params: { includeInactive } }).then((r) => r.data);

export const getUser = (userId: number) => api.get<SecurityUser>(`/security/users/${userId}`).then((r) => r.data);

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
  registration_number?: string;
}

export const createUser = (input: CreateUserInput) => api.post<SecurityUser>('/security/users', input).then((r) => r.data);

export interface UpdateUserInput {
  role?: Role;
  is_active?: boolean;
  registration_number?: string;
}

export const updateUser = (userId: number, input: UpdateUserInput) =>
  api.put<SecurityUser>(`/security/users/${userId}`, input).then((r) => r.data);

export const resetPassword = (userId: number, newPassword: string) =>
  api.post<SecurityUser>(`/security/users/${userId}/reset-password`, { newPassword }).then((r) => r.data);

export const unlockUser = (userId: number) => api.post<SecurityUser>(`/security/users/${userId}/unlock`).then((r) => r.data);

export interface PermissionMatrixEntry {
  module: string;
  action: string;
  roles: string[];
}

export const getPermissionMatrix = () => api.get<PermissionMatrixEntry[]>('/security/permission-matrix').then((r) => r.data);
