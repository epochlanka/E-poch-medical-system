import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute, { CommonLoginRedirect, RoleRedirect } from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/dashboard/Dashboard';
import Prescriptions from './pages/prescriptions/Prescriptions';
import PharmacyQueue from './pages/pharmacy/PharmacyQueue';
import Dispensing from './pages/pharmacy/Dispensing';
import SubstitutionRules from './pages/pharmacy/SubstitutionRules';
import MedicineCatalog from './pages/inventory/MedicineCatalog';
import InventoryOperations from './pages/operations/InventoryOperations';
import PurchasingOperations from './pages/operations/PurchasingOperations';
import BillingReports from './pages/operations/BillingReports';

const RootRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

const LoginEntry = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <CommonLoginRedirect />;
  return user.role === 'Pharmacist' ? <Navigate to="/dashboard" replace /> : <RoleRedirect role={user.role} />;
};

const LegacyPartialRedirect = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  return <Navigate to={prescriptionId ? `/pharmacy/dispensing/${prescriptionId}` : '/pharmacy/dispensing'} replace />;
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
          <Route path="/pharmacy/partial-dispense" element={<LegacyPartialRedirect />} />
          <Route path="/pharmacy/partial-dispense/:prescriptionId" element={<LegacyPartialRedirect />} />
          <Route path="/pharmacy/substitution-rules" element={<SubstitutionRules />} />
          <Route path="/inventory/medicines" element={<MedicineCatalog />} />
          <Route path="/inventory/batches" element={<InventoryOperations mode="batches" />} />
          <Route path="/inventory/stock-ledger" element={<InventoryOperations mode="stock-ledger" />} />
          <Route path="/inventory/low-stock" element={<InventoryOperations mode="low-stock" />} />
          <Route path="/inventory/expiry-alerts" element={<InventoryOperations mode="expiry-alerts" />} />
          <Route path="/inventory/stock-take" element={<InventoryOperations mode="stock-take" />} />
          <Route path="/inventory/adjustment" element={<InventoryOperations mode="adjustment" />} />
          <Route path="/suppliers" element={<PurchasingOperations mode="suppliers" />} />
          <Route path="/purchase-orders" element={<PurchasingOperations mode="purchase-orders" />} />
          <Route path="/goods-received" element={<PurchasingOperations mode="goods-received" />} />
          <Route path="/grn-review" element={<PurchasingOperations mode="grn-review" />} />
          <Route path="/billing" element={<BillingReports mode="billing" />} />
          <Route path="/reports" element={<BillingReports mode="reports" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
