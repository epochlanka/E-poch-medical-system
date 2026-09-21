export type UserRole = 'Admin' | 'Doctor' | 'Receptionist' | 'Pharmacist' | 'FrontDesk';

const portalUrl = (port: number) => `${window.location.protocol}//${window.location.hostname}:${port}`;

const PORTAL_URLS: Record<UserRole, string> = {
  Admin: import.meta.env.VITE_ADMIN_APP_URL || portalUrl(5173),
  Doctor: import.meta.env.VITE_DOCTOR_APP_URL || portalUrl(5174),
  FrontDesk: import.meta.env.VITE_FRONT_DESK_APP_URL || import.meta.env.VITE_RECEPTIONIST_APP_URL || portalUrl(5175),
  Receptionist: import.meta.env.VITE_RECEPTIONIST_APP_URL || portalUrl(5175),
  Pharmacist: import.meta.env.VITE_PHARMACIST_APP_URL || portalUrl(5176),
};

export const isUserRole = (role: string): role is UserRole => Object.hasOwn(PORTAL_URLS, role);

export const roleHomeUrl = (role: UserRole) => `${PORTAL_URLS[role].replace(/\/$/, '')}/dashboard`;

export const commonLoginUrl = () => `${PORTAL_URLS.Admin.replace(/\/$/, '')}/login`;

export const redirectToRoleHome = (role: UserRole) => window.location.replace(roleHomeUrl(role));
