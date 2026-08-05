import type { Role, SecurityUser } from '../../lib/security';

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const ROLE_BADGE: Record<Role, string> = {
  Admin: 'badge-blue',
  Doctor: 'badge-green',
  Pharmacist: 'badge-purple',
  Receptionist: 'badge-amber',
};

export const ROLE_LABEL: Record<Role, string> = {
  Admin: 'Administrator',
  Doctor: 'Doctor',
  Pharmacist: 'Pharmacist',
  Receptionist: 'Receptionist',
};

export const isLocked = (user: Pick<SecurityUser, 'locked_until'>) => !!user.locked_until && new Date(user.locked_until) > new Date();

export const userStatus = (user: SecurityUser): 'Active' | 'Inactive' | 'Locked' => {
  if (isLocked(user)) return 'Locked';
  return user.is_active ? 'Active' : 'Inactive';
};

export const STATUS_BADGE: Record<'Active' | 'Inactive' | 'Locked', string> = {
  Active: 'badge-green',
  Inactive: 'badge-gray',
  Locked: 'badge-red',
};
