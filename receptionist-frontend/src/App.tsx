import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Patients from './pages/patients/Patients';
import RegisterPatient from './pages/patients/RegisterPatient';
import DuplicateReview from './pages/patients/DuplicateReview';
import FamilyDirectory from './pages/families/FamilyDirectory';
import FamilyMemberRoster from './pages/families/FamilyMemberRoster';
import HeadOfFamily from './pages/families/HeadOfFamily';
import BookAppointment from './pages/appointments/BookAppointment';
import WalkInQueue from './pages/appointments/WalkInQueue';
import LiveQueueBoard from './pages/appointments/LiveQueueBoard';
import SkipRecallLog from './pages/appointments/SkipRecallLog';
import ConsolidatedInvoice from './pages/billing/ConsolidatedInvoice';
import Payments from './pages/billing/Payments';
import LabTestOrders from './pages/labTestOrders/LabTestOrders';
import ComingSoon from './pages/ComingSoon';
import { navSections } from './components/layout/navConfig';

const unimplementedPaths = navSections
  .flatMap((section) => section.items)
  .filter((item) => !item.implemented)
  .map((item) => item.path);

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/patients/all" element={<Patients />} />
          <Route path="/patients/register" element={<RegisterPatient />} />
          <Route path="/patients/duplicates" element={<DuplicateReview />} />
          <Route path="/families/directory" element={<FamilyDirectory />} />
          <Route path="/families/roster" element={<FamilyMemberRoster />} />
          <Route path="/families/roster/:familyId" element={<FamilyMemberRoster />} />
          <Route path="/families/head-of-family" element={<HeadOfFamily />} />
          <Route path="/appointments/book" element={<BookAppointment />} />
          <Route path="/appointments/walk-in" element={<WalkInQueue />} />
          <Route path="/queue/live" element={<LiveQueueBoard />} />
          <Route path="/queue/skip-recall" element={<SkipRecallLog />} />
          <Route path="/billing/invoices" element={<ConsolidatedInvoice />} />
          <Route path="/billing/payments" element={<Payments />} />
          <Route path="/lab-tests/queue" element={<LabTestOrders />} />
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
