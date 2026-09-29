import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import FrontDeskShell from '../reception/frontDesk/FrontDeskShell';
import { WORKSPACES, workspaceHome } from '../../app/workspaces';

import Dashboard from './pages/dashboard/Dashboard';
import Prescriptions from './pages/prescriptions/Prescriptions';
import PharmacyQueue from './pages/pharmacy/PharmacyQueue';
import Dispensing from './pages/pharmacy/Dispensing';
import SubstitutionRules from './pages/pharmacy/SubstitutionRules';
import MedicineCatalog from './pages/inventory/MedicineCatalog';
import InventoryOperations from './pages/operations/InventoryOperations';
import PurchasingOperations from './pages/operations/PurchasingOperations';
import BillingReports from './pages/operations/BillingReports';

/**
 * The pharmacy workspace, mounted by the shell at /pharmacy. Its pages used to sit at the root of
 * the pharmacist portal, so paths that already began with /pharmacy lost that segment on the way in
 * — /pharmacy/queue is still /pharmacy/queue once the shell adds the prefix back.
 */

const home = workspaceHome(WORKSPACES.pharmacy);

/** The partial-dispense screens were folded into dispensing; keep old links working. */
const LegacyPartialRedirect = () => {
  const { prescriptionId } = useParams<{ prescriptionId: string }>();
  return <Navigate to={prescriptionId ? `${WORKSPACES.pharmacy.base}/dispensing/${prescriptionId}` : `${WORKSPACES.pharmacy.base}/dispensing`} replace />;
};

const PharmacyWorkspace = () => (
  <FrontDeskShell desk="Pharmacy">
    <Routes>
      <Route index element={<Navigate to={home} replace />} />
      <Route path="queue" element={<PharmacyQueue />} />
      <Route path="dispensing" element={<Dispensing />} />
      <Route path="dispensing/:prescriptionId" element={<Dispensing />} />
      <Route path="partial-dispense" element={<LegacyPartialRedirect />} />
      <Route path="partial-dispense/:prescriptionId" element={<LegacyPartialRedirect />} />
      <Route path="substitution-rules" element={<SubstitutionRules />} />
      <Route path="prescriptions" element={<Prescriptions />} />
      <Route path="overview" element={<Dashboard />} />
      <Route path="inventory/medicines" element={<MedicineCatalog />} />
      {(['batches', 'stock-ledger', 'low-stock', 'expiry-alerts', 'stock-take', 'adjustment'] as const).map((mode) => (
        <Route key={mode} path={`inventory/${mode}`} element={<InventoryOperations mode={mode} />} />
      ))}
      {(['suppliers', 'purchase-orders', 'goods-received', 'grn-review'] as const).map((mode) => (
        <Route key={mode} path={mode} element={<PurchasingOperations mode={mode} />} />
      ))}
      <Route path="billing" element={<BillingReports mode="billing" />} />
      <Route path="reports" element={<BillingReports mode="reports" />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </FrontDeskShell>
);

export default PharmacyWorkspace;
