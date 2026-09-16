// FrontDesk combines counter duties, without doctor or administrator privileges.
export const hasRoleAccess = (role: string, allowed: readonly string[]) =>
  allowed.includes(role) || (role === 'FrontDesk' && allowed.some(value => value === 'Receptionist' || value === 'Pharmacist'));
