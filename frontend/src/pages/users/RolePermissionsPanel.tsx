import type { PermissionMatrixEntry, Role, SecurityUser } from '../../lib/security';
import { ROLES } from '../../lib/security';
import { UsersIcon, StethoscopeIcon, PharmacyIcon, CalendarIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon } from '../../components/layout/Icons';
import { ROLE_LABEL } from './usersRolesUtils';
import type { ComponentType } from 'react';

const ROLE_ICON: Record<Role, ComponentType> = {
  Admin: UsersIcon,
  Doctor: StethoscopeIcon,
  Pharmacist: PharmacyIcon,
  Receptionist: CalendarIcon,
};
const ROLE_ICON_COLOR: Record<Role, { bg: string; fg: string }> = {
  Admin: { bg: '#dbeafe', fg: '#1d4ed8' },
  Doctor: { bg: '#dcfce7', fg: '#16a34a' },
  Pharmacist: { bg: '#ede9fe', fg: '#6d28d9' },
  Receptionist: { bg: '#fef3c7', fg: '#b45309' },
};

interface RolePermissionsPanelProps {
  users: SecurityUser[];
  matrix: PermissionMatrixEntry[];
  selectedRole: Role;
  onSelectRole: (role: Role) => void;
}

const RolePermissionsPanel = ({ users, matrix, selectedRole, onSelectRole }: RolePermissionsPanelProps) => {
  const countForRole = (role: Role) => users.filter((u) => u.role === role).length;
  const hasAllAccess = matrix.length > 0 && matrix.every((entry) => entry.roles.includes(selectedRole));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Roles &amp; Permissions</h3>
        </div>
        <div className="ur-role-list">
          {ROLES.map((role) => {
            const Icon = ROLE_ICON[role];
            const colors = ROLE_ICON_COLOR[role];
            return (
              <button key={role} className={`ur-role-row${role === selectedRole ? ' selected' : ''}`} onClick={() => onSelectRole(role)}>
                <div className="ur-role-icon" style={{ background: colors.bg, color: colors.fg }}>
                  <Icon />
                </div>
                <span className="ur-role-name">{ROLE_LABEL[role]}</span>
                <span className="ur-role-count">{countForRole(role)} Users</span>
                <span className="ur-role-chevron">
                  <ChevronRightIcon />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Permissions for {ROLE_LABEL[selectedRole]}</h3>
          {hasAllAccess && <span className="ur-all-access">ALL ACCESS</span>}
        </div>
        {matrix.length === 0 && <div className="card-empty">Loading…</div>}
        <div className="ur-perm-list">
          {matrix.map((entry) => {
            const granted = entry.roles.includes(selectedRole);
            return (
              <div className={`ur-perm-row${granted ? ' granted' : ' denied'}`} key={`${entry.module}-${entry.action}`}>
                <span className="ur-perm-icon">{granted ? <CheckCircleIcon /> : <XCircleIcon />}</span>
                <span>
                  {entry.module} <span style={{ color: '#94a3b8' }}>· {entry.action}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RolePermissionsPanel;
