import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute, { RoleRedirect } from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Prescriptions from './pages/prescriptions/Prescriptions';
import PharmacyQueue from './pages/pharmacy/PharmacyQueue';
import Dispensing from './pages/pharmacy/Dispensing';
import PartialDispense from './pages/pharmacy/PartialDispense';
import SubstitutionRules from './pages/pharmacy/SubstitutionRules';
import MedicineCatalog from './pages/inventory/MedicineCatalog';
import ComingSoon from './pages/ComingSoon';
import { navSections } from './components/layout/navConfig';

const unimplementedPaths = navSections
  .flatMap((section) => section.items)
  .filter((item) => !item.implemented)
  .map((item) => item.path);

const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

const LoginEntry = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Login />;
  return user.role === 'Pharmacist' ? <Navigate to="/dashboard" replace /> : <RoleRedirect role={user.role} />;
};

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginEntry />} />

        <Route
          element={
            <ProtectedRoute requiredRole="Pharmacist">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/pharmacy/queue" element={<PharmacyQueue />} />
          <Route path="/pharmacy/dispensing" element={<Dispensing />} />
          <Route path="/pharmacy/dispensing/:prescriptionId" element={<Dispensing />} />
          <Route path="/pharmacy/partial-dispense" element={<PartialDispense />} />
          <Route path="/pharmacy/partial-dispense/:prescriptionId" element={<PartialDispense />} />
          <Route path="/pharmacy/substitution-rules" element={<SubstitutionRules />} />
          <Route path="/inventory/medicines" element={<MedicineCatalog />} />
          {unimplementedPaths.map((path) => (
            <Route key={path} path={path} element={<ComingSoon />} />
          ))}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
