import { createContext, useContext } from 'react';
import { WORKSPACES, workspaceHome } from '../../../app/workspaces';

/**
 * Reception and pharmacy are two workspaces sharing one shell — the front desk. A FrontDesk user
 * holds both and switches between them without signing out; a Receptionist or a Pharmacist sees
 * only their own.
 *
 * Both used to be one app whose routes sat at the root, so which desk you were on had to be
 * guessed from the path. Now each desk is mounted under its own prefix and the question is exact.
 */
export const RECEPTION_HOME = workspaceHome(WORKSPACES.reception);
export const PHARMACY_HOME = workspaceHome(WORKSPACES.pharmacy);

export const isPharmacyPath = (path: string) =>
  path === WORKSPACES.pharmacy.base || path.startsWith(`${WORKSPACES.pharmacy.base}/`);

/** Full app path for a page belonging to one of the two desks. */
export const deskPath = (desk: 'Reception' | 'Pharmacy', path: string) =>
  `${desk === 'Pharmacy' ? WORKSPACES.pharmacy.base : WORKSPACES.reception.base}${path}`;

export interface WorkspaceState {
  pharmacy: boolean;
  canReception: boolean;
  canPharmacy: boolean;
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export const useWorkspace = () => {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error('Front desk workspace unavailable');
  return state;
};
