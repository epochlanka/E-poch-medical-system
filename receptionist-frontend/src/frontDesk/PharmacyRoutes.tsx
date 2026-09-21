import { Navigate, Route, Routes } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import PharmacyQueue from '../../../pharmacist-frontend/src/pages/pharmacy/PharmacyQueue';
import Dispensing from '../../../pharmacist-frontend/src/pages/pharmacy/Dispensing';
import Prescriptions from '../../../pharmacist-frontend/src/pages/prescriptions/Prescriptions';
import SubstitutionRules from '../../../pharmacist-frontend/src/pages/pharmacy/SubstitutionRules';
import MedicineCatalog from '../../../pharmacist-frontend/src/pages/inventory/MedicineCatalog';
import InventoryOperations from '../../../pharmacist-frontend/src/pages/operations/InventoryOperations';
import PurchasingOperations from '../../../pharmacist-frontend/src/pages/operations/PurchasingOperations';
import BillingReports from '../../../pharmacist-frontend/src/pages/operations/BillingReports';

export default function PharmacyRoutes({ location }: { location: Location }) {
  return <Routes location={location}>
    <Route path="/pharmacy/queue" element={<PharmacyQueue />} />
    <Route path="/pharmacy/dispensing" element={<Dispensing />} />
    <Route path="/pharmacy/dispensing/:prescriptionId" element={<Dispensing />} />
    <Route path="/prescriptions" element={<Prescriptions />} />
    <Route path="/pharmacy/substitution-rules" element={<SubstitutionRules />} />
    <Route path="/inventory/medicines" element={<MedicineCatalog />} />
    {(['batches', 'stock-ledger', 'low-stock', 'expiry-alerts', 'stock-take', 'adjustment'] as const).map(mode => <Route key={mode} path={`/inventory/${mode}`} element={<InventoryOperations mode={mode} />} />)}
    {(['suppliers', 'purchase-orders', 'goods-received', 'grn-review'] as const).map(mode => <Route key={mode} path={`/${mode}`} element={<PurchasingOperations mode={mode} />} />)}
    <Route path="/reports" element={<BillingReports mode="reports" />} />
    <Route path="/billing" element={<Navigate to="/billing/invoices" replace />} />
    <Route path="*" element={<Navigate to="/pharmacy/queue" replace />} />
  </Routes>;
}
