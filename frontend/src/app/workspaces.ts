// The workspace model for the unified app.
//
// Every role lands in one or more workspaces, each mounted under its own route prefix in a single
// application on a single origin. This replaces the old config/roleRoutes.ts, where a "workspace"
// was a separate Vite app on its own port (5173-5176) and switching meant a cross-origin page load.
//
// Workspaces are migrated into this app one at a time. Until a workspace's `migrated` flag is
// flipped, this app still hands its users off to the legacy portal on `legacyPort` — so the shared
// login is usable for every role from day one, without waiting for all four portals to move.

export type UserRole = 'Admin' | 'Doctor' | 'Receptionist' | 'Pharmacist' | 'FrontDesk';
export type WorkspaceId = 'admin' | 'doctor' | 'reception' | 'pharmacy';

export interface Workspace {
  id: WorkspaceId;
  /** Route prefix inside this app. */
  base: string;
  /** Landing path within the workspace, appended to `base`. */
  home: string;
  label: string;
  /** What the user is told they are entering, on the login confirmation screen. */
  description: string;
  /** Themes the confirmation screen; matches the existing theme-* classes. */
  theme: string;
  /** Short mark shown in the confirmation avatar. */
  mark: string;
  /** False while this workspace still lives in its own portal (see legacyPort). */
  migrated: boolean;
  /** Port of the standalone portal this workspace came from, used until it is migrated. */
  legacyPort: number;
  /** Optional build-time override for the legacy portal's address. */
  legacyUrlEnv?: string;
}

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  admin: {
    id: 'admin',
    base: '/admin',
    home: '/dashboard',
    label: 'Administration',
    description: 'Administration workspace',
    theme: 'admin',
    mark: 'A',
    migrated: true,
    legacyPort: 5173,
    legacyUrlEnv: 'VITE_ADMIN_APP_URL',
  },
  doctor: {
    id: 'doctor',
    base: '/doctor',
    home: '/dashboard',
    label: 'Clinical',
    description: 'Clinical workspace',
    theme: 'doctor',
    mark: '✚',
    migrated: true,
    legacyPort: 5174,
    legacyUrlEnv: 'VITE_DOCTOR_APP_URL',
  },
  reception: {
    id: 'reception',
    base: '/reception',
    home: '/dashboard',
    label: 'Reception',
    description: 'Reception workspace',
    theme: 'receptionist',
    mark: 'R',
    migrated: true,
    legacyPort: 5175,
    legacyUrlEnv: 'VITE_RECEPTIONIST_APP_URL',
  },
  pharmacy: {
    id: 'pharmacy',
    base: '/pharmacy',
    home: '/queue',
    label: 'Pharmacy',
    description: 'Pharmacy workspace',
    theme: 'pharmacist',
    mark: 'Rx',
    migrated: true,
    legacyPort: 5176,
    legacyUrlEnv: 'VITE_PHARMACIST_APP_URL',
  },
};

// Mirrors the backend's hasRoleAccess (backend/src/config/roles.ts): FrontDesk is exactly
// Receptionist + Pharmacist, with no doctor or administrator privileges. Keep the two in step —
// this table is for navigation only, the backend is what actually enforces access.
const ROLE_WORKSPACES: Record<UserRole, readonly WorkspaceId[]> = {
  Admin: ['admin'],
  Doctor: ['doctor'],
  Receptionist: ['reception'],
  Pharmacist: ['pharmacy'],
  FrontDesk: ['reception', 'pharmacy'],
};

export const isUserRole = (role: string): role is UserRole => Object.hasOwn(ROLE_WORKSPACES, role);

export const workspacesForRole = (role: UserRole): Workspace[] =>
  ROLE_WORKSPACES[role].map((id) => WORKSPACES[id]);

/** Where a role goes when it has not asked for anywhere in particular. */
export const defaultWorkspaceForRole = (role: UserRole): Workspace => workspacesForRole(role)[0];

export const canAccessWorkspace = (role: UserRole, id: WorkspaceId): boolean =>
  ROLE_WORKSPACES[role].includes(id);

/** Full in-app path of a workspace's landing page, e.g. '/admin/dashboard'. */
export const workspaceHome = (workspace: Workspace): string => `${workspace.base}${workspace.home}`;

export const homePathForRole = (role: UserRole): string => workspaceHome(defaultWorkspaceForRole(role));

/** Which workspace a path belongs to, or undefined for shared routes such as /login. */
export const workspaceForPath = (pathname: string): Workspace | undefined =>
  Object.values(WORKSPACES).find(
    (ws) => pathname === ws.base || pathname.startsWith(`${ws.base}/`)
  );

/**
 * Address of the standalone portal a not-yet-migrated workspace still lives in. Defaults to this
 * same host so a workstation that opened the app over the LAN is handed a LAN address, not its own
 * localhost.
 */
export const legacyPortalUrl = (workspace: Workspace): string => {
  const override = workspace.legacyUrlEnv ? import.meta.env[workspace.legacyUrlEnv] : undefined;
  const base = override || `${window.location.protocol}//${window.location.hostname}:${workspace.legacyPort}`;
  return `${String(base).replace(/\/$/, '')}${workspace.home}`;
};
