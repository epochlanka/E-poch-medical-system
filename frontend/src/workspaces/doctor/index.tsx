import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { navSections } from './components/layout/navConfig';
import { WORKSPACES, workspaceHome } from '../../app/workspaces';

import Dashboard from './pages/dashboard/Dashboard';
import LiveQueue from './pages/queue/LiveQueue';
import CallNext from './pages/queue/CallNext';
import SkipRecall from './pages/queue/SkipRecall';
import ConsultationWorkspace from './pages/consultations/ConsultationWorkspace';
import MyConsultations from './pages/consultations/MyConsultations';
import FollowUpsDue from './pages/consultations/FollowUpsDue';
import NewPrescription from './pages/prescriptions/NewPrescription';
import MyPrescriptions from './pages/prescriptions/MyPrescriptions';
import RepeatPrescription from './pages/prescriptions/RepeatPrescription';
import PatientSearch from './pages/patients/PatientSearch';
import MyLabReports from './pages/labTestOrders/MyLabReports';
import MyReports from './pages/reports/MyReports';
import ClinicalStatistics from './pages/reports/ClinicalStatistics';
import ComingSoon from './pages/ComingSoon';

/** The clinical workspace, mounted by the shell at /doctor. Paths are workspace-local. */

const home = workspaceHome(WORKSPACES.doctor);

const unimplementedPaths = navSections
  .flatMap((section) => section.items)
  .filter((item) => !item.implemented)
  .map((item) => item.path.replace(/^\//, ''));

const DoctorWorkspace = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="queue/live" element={<LiveQueue />} />
      <Route path="queue/call-next" element={<CallNext />} />
      <Route path="queue/skip-recall" element={<SkipRecall />} />
      <Route path="consultations/workspace" element={<ConsultationWorkspace />} />
      <Route path="consultations/workspace/:appointmentId" element={<ConsultationWorkspace />} />
      <Route path="consultations/my" element={<MyConsultations />} />
      <Route path="consultations/follow-ups" element={<FollowUpsDue />} />
      <Route path="prescriptions/new" element={<NewPrescription />} />
      <Route path="prescriptions/new/:consultationId" element={<NewPrescription />} />
      <Route path="prescriptions/my" element={<MyPrescriptions />} />
      <Route path="prescriptions/repeat" element={<RepeatPrescription />} />
      <Route path="lab-reports/my" element={<MyLabReports />} />
      <Route path="patients/search" element={<PatientSearch />} />
      <Route path="patients/search/:patientId" element={<PatientSearch />} />
      <Route path="reports/my" element={<MyReports />} />
      <Route path="reports/clinical-statistics" element={<ClinicalStatistics />} />
      {unimplementedPaths.map((path) => (
        <Route key={path} path={path} element={<ComingSoon />} />
      ))}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Route>
  </Routes>
);

export default DoctorWorkspace;
