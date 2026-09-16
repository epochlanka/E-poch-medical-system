import { hasRoleAccess } from './roles';
import { PERMISSION_MATRIX } from '../modules/security/permissionMatrix';
import { requireRole } from '../middlewares/auth';

describe('clinic front desk access', () => {
  test.each(['Receptionist', 'Pharmacist'])('includes %s duties', role => {
    expect(hasRoleAccess('FrontDesk', [role])).toBe(true);
  });
  test.each([['Doctor'], ['Admin'], ['Doctor', 'Admin'], []])('denies privileges outside counter duties: %j', (...roles) => {
    expect(hasRoleAccess('FrontDesk', roles)).toBe(false);
  });
  test('keeps existing reception and pharmacy accounts separate', () => {
    expect(hasRoleAccess('Receptionist', ['Pharmacist'])).toBe(false);
    expect(hasRoleAccess('Pharmacist', ['Receptionist'])).toBe(false);
  });
  test('published permissions match enforcement', () => {
    for (const entry of PERMISSION_MATRIX) {
      const base = entry.roles.filter(role => role !== 'FrontDesk');
      expect(entry.roles.includes('FrontDesk')).toBe(hasRoleAccess('FrontDesk', base));
    }
  });
  test('middleware authorizes the original actor without replacing their role', () => {
    const user = { user_id: 42, role: 'FrontDesk' };
    const req = { user } as any;
    const next = jest.fn();
    requireRole(['Pharmacist'])(req, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBe(user);
    expect(user.role).toBe('FrontDesk');
  });
  test('middleware rejects doctor-only actions', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();
    requireRole(['Doctor'])({ user: { role: 'FrontDesk' } } as any, { status } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
