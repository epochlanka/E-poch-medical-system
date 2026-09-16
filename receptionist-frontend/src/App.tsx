import { useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CommonLoginRedirect, RoleRedirect } from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ReceptionRoutes from './frontDesk/ReceptionRoutes';
import PharmacyRoutes from './frontDesk/PharmacyRoutes';
import { WorkspaceContext, isPharmacyPath } from './frontDesk/WorkspaceContext';
import './frontDesk/frontDesk.css';

const initialLocation = (pathname: string): Location => ({ pathname, search: '', hash: '', state: null, key: pathname });
function FrontDeskPortal() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const pharmacy = isPharmacyPath(location.pathname);
  const receptionLocation = useRef(initialLocation('/dashboard'));
  const pharmacyLocation = useRef(initialLocation('/pharmacy/queue'));
  const visited = useRef({ reception: false, pharmacy: false });
  if (pharmacy) { pharmacyLocation.current = location; visited.current.pharmacy = true; }
  else { receptionLocation.current = location; visited.current.reception = true; }
  if (loading) return <p>Opening front desk…</p>;
  if (!user) return <CommonLoginRedirect />;
  const canReception = ['FrontDesk', 'Receptionist'].includes(user.role);
  const canPharmacy = ['FrontDesk', 'Pharmacist'].includes(user.role);
  if (!canReception && !canPharmacy) return <RoleRedirect role={user.role} />;
  if (pharmacy && !canPharmacy) return <Navigate to="/dashboard" replace />;
  if (!pharmacy && !canReception) return <Navigate to="/pharmacy/queue" replace />;
  if (['/', '/login'].includes(location.pathname)) return <Navigate to={canReception ? '/dashboard' : '/pharmacy/queue'} replace />;
  return <WorkspaceContext.Provider value={{ pharmacy, receptionLocation: receptionLocation.current, pharmacyLocation: pharmacyLocation.current, canReception, canPharmacy }}>
    <AppLayout>
      {canReception && visited.current.reception && <section hidden={pharmacy} aria-label="Reception workspace"><ReceptionRoutes location={receptionLocation.current} /></section>}
      {canPharmacy && visited.current.pharmacy && <section hidden={!pharmacy} aria-label="Pharmacy workspace"><PharmacyRoutes location={pharmacyLocation.current} /></section>}
    </AppLayout>
  </WorkspaceContext.Provider>;
}
export default function App() {
  return <AuthProvider><Routes><Route path="/*" element={<FrontDeskPortal />} /></Routes></AuthProvider>;
}
