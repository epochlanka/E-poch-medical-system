import { createContext, useContext } from 'react';
import type { Location } from 'react-router-dom';

export const isPharmacyPath = (path: string) => /^\/(pharmacy|inventory|prescriptions|suppliers|purchase-orders|goods-received|grn-review)(\/|$)/.test(path) || ['/reports', '/overview', '/billing'].includes(path);
export interface WorkspaceState {
  pharmacy: boolean;
  receptionLocation: Location;
  pharmacyLocation: Location;
  canReception: boolean;
  canPharmacy: boolean;
}
export const WorkspaceContext = createContext<WorkspaceState | null>(null);
export const useWorkspace = () => {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error('Front desk workspace unavailable');
  return state;
};
