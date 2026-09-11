import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute, { RoleRedirect } from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import LoginConfirmation from './pages/LoginConfirmation';
import Dashboard from './pages/dashboard/Dashboard';
import Patients from './pages/patients/Patients';
import Families from './pages/families/Families';
import Pharmacy from './pages/pharmacy/Pharmacy';
import Medicines from './pages/medicines/Medicines';
import Appointments from './pages/appointments/Appointments';
import StockManagement from './pages/stock/StockManagement';
import PurchaseOrders from './pages/purchaseOrders/PurchaseOrders';
import Suppliers from './pages/suppliers/Suppliers';
import Invoices from './pages/invoices/Invoices';
import Reports from './pages/reports/Reports';
import UsersRoles from './pages/users/UsersRoles';
import Payments from './pages/payments/Payments';
import Settings from './pages/settings/Settings';
import ConsultationsQueue from './pages/consultations/ConsultationsQueue';
import Consultation from './pages/consultations/Consultation';
import PrescriptionsQueue from './pages/prescriptions/PrescriptionsQueue';
import NewPrescription from './pages/prescriptions/NewPrescription';
import PrescriptionView from './pages/prescriptions/PrescriptionView';
import LabTestOrders from './pages/labTestOrders/LabTestOrders';
import ComingSoon from './pages/ComingSoon';
import QueueDashboard from './pages/QueueDashboard';
import BookAppointment from './pages/BookAppointment';
import LetterTemplates from './pages/letters/LetterTemplates';
import LetterTemplateEditor from './pages/letters/LetterTemplateEditor';
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
  return user.role === 'Admin' ? <Navigate to="/dashboard" replace /> : <RoleRedirect role={user.role} />;
};

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginEntry />} />
        <Route path="/login/confirm" element={<LoginConfirmation />} />

        <Route
          element={
            <ProtectedRoute requiredRole="Admin">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/patients" element={<Patients />} />
          <Route path="/families" element={<Families />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/pharmacy" element={<Pharmacy />} />
          <Route path="/inventory/medicines" element={<Medicines />} />
          <Route path="/inventory/stock" element={<StockManagement />} />
          <Route path="/inventory/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/billing/invoices" element={<Invoices />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<UsersRoles />} />
          <Route path="/billing/payments" element={<Payments />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/consultations" element={<ConsultationsQueue />} />
          <Route path="/consultations/:appointmentId" element={<Consultation />} />
          <Route path="/prescriptions" element={<PrescriptionsQueue />} />
          <Route path="/prescriptions/new/:consultationId" element={<NewPrescription />} />
          <Route path="/prescriptions/:prescriptionId" element={<PrescriptionView />} />
          <Route path="/lab-test-orders" element={<LabTestOrders />} />
          <Route path="/queue" element={<QueueDashboard />} />
          <Route path="/book-appointment" element={<BookAppointment />} />
          <Route path="/letter-templates" element={<LetterTemplates />} />
          <Route path="/letter-templates/new" element={<LetterTemplateEditor />} />
          <Route path="/letter-templates/:templateId" element={<LetterTemplateEditor />} />
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
