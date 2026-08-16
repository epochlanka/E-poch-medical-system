import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import LiveQueue from './pages/queue/LiveQueue';
import CallNext from './pages/queue/CallNext';
import SkipRecall from './pages/queue/SkipRecall';
import ConsultationWorkspace from './pages/consultations/ConsultationWorkspace';
import MyConsultations from './pages/consultations/MyConsultations';
import NewPrescription from './pages/prescriptions/NewPrescription';
import FollowUpsDue from './pages/consultations/FollowUpsDue';
import MyPrescriptions from './pages/prescriptions/MyPrescriptions';
import RepeatPrescription from './pages/prescriptions/RepeatPrescription';
import PatientSearch from './pages/patients/PatientSearch';
import MyReports from './pages/reports/MyReports';
import ClinicalStatistics from './pages/reports/ClinicalStatistics';
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
          <Route path="/queue/live" element={<LiveQueue />} />
          <Route path="/queue/call-next" element={<CallNext />} />
          <Route path="/queue/skip-recall" element={<SkipRecall />} />
          <Route path="/consultations/workspace" element={<ConsultationWorkspace />} />
          <Route path="/consultations/workspace/:appointmentId" element={<ConsultationWorkspace />} />
          <Route path="/consultations/my" element={<MyConsultations />} />
          <Route path="/prescriptions/new" element={<NewPrescription />} />
          <Route path="/prescriptions/new/:consultationId" element={<NewPrescription />} />
          <Route path="/consultations/follow-ups" element={<FollowUpsDue />} />
          <Route path="/prescriptions/my" element={<MyPrescriptions />} />
          <Route path="/prescriptions/repeat" element={<RepeatPrescription />} />
          <Route path="/patients/search" element={<PatientSearch />} />
          <Route path="/patients/search/:patientId" element={<PatientSearch />} />
          <Route path="/reports/my" element={<MyReports />} />
          <Route path="/reports/clinical-statistics" element={<ClinicalStatistics />} />
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
