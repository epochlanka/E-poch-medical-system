import type { ReactNode } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { FeedbackProvider } from '../../../shared/ui/feedback';
import AppLayout from '../components/layout/AppLayout';
import { WorkspaceContext } from './WorkspaceContext';
import './frontDesk.css';

/**
 * The shell both front desk workspaces render inside.
 *
 * Reception and pharmacy are separate workspaces with their own route prefixes, but one counter:
 * the same sidebar, topbar, global search and prescription notices serve both, and a FrontDesk
 * account switches between them from the topbar. A Receptionist or Pharmacist sees the same shell
 * with the other desk's switch hidden.
 */
const FrontDeskShell = ({ desk, children }: { desk: 'Reception' | 'Pharmacy'; children: ReactNode }) => {
  const { user } = useAuth();
  const role = user?.role;
  // Mirrors the backend's hasRoleAccess: FrontDesk is Receptionist + Pharmacist.
  const canReception = role === 'FrontDesk' || role === 'Receptionist';
  const canPharmacy = role === 'FrontDesk' || role === 'Pharmacist';

  return (
    <FeedbackProvider>
      <WorkspaceContext.Provider value={{ pharmacy: desk === 'Pharmacy', canReception, canPharmacy }}>
        <AppLayout>{children}</AppLayout>
      </WorkspaceContext.Provider>
    </FeedbackProvider>
  );
};

export default FrontDeskShell;
