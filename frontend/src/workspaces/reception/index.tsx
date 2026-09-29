import { Navigate, Route, Routes } from 'react-router-dom';
import FrontDeskShell from './frontDesk/FrontDeskShell';
import { navSections } from './components/layout/navConfig';
import { WORKSPACES, workspaceHome } from '../../app/workspaces';

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

/** The reception workspace, mounted by the shell at /reception. */

const home = workspaceHome(WORKSPACES.reception);

const unimplementedPaths = navSections
  .flatMap((section) => section.items)
  .filter((item) => !item.implemented)
  .map((item) => item.path.replace(/^\//, ''));

const ReceptionWorkspace = () => (
  <FrontDeskShell desk="Reception">
    <Routes>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="patients/all" element={<Patients />} />
      <Route path="patients/register" element={<RegisterPatient />} />
      <Route path="patients/duplicates" element={<DuplicateReview />} />
      <Route path="families/directory" element={<FamilyDirectory />} />
      <Route path="families/roster" element={<FamilyMemberRoster />} />
      <Route path="families/roster/:familyId" element={<FamilyMemberRoster />} />
      <Route path="families/head-of-family" element={<HeadOfFamily />} />
      <Route path="appointments/book" element={<BookAppointment />} />
      <Route path="appointments/walk-in" element={<WalkInQueue />} />
      <Route path="queue/live" element={<LiveQueueBoard />} />
      <Route path="queue/skip-recall" element={<SkipRecallLog />} />
      <Route path="billing/invoices" element={<ConsolidatedInvoice />} />
      <Route path="billing/payments" element={<Payments />} />
      <Route path="lab-tests/queue" element={<LabTestOrders />} />
      {unimplementedPaths.map((path) => (
        <Route key={path} path={path} element={<ComingSoon />} />
      ))}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </FrontDeskShell>
);

export default ReceptionWorkspace;
