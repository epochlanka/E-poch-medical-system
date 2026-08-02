// Section 6 permission matrix reference (SEC-04, NFR-07): a read-only mirror of the
// requireRole(...) calls that actually gate each route, kept here so the frontend can hide
// controls a role can't use without duplicating the role list in every screen. This data
// structure does NOT enforce anything — the source of truth for enforcement is each module's
// own router.ts. If a router's requireRole list changes, update the matching entry here too.
export interface PermissionMatrixEntry {
  module: string;
  action: string;
  roles: string[];
}

export const PERMISSION_MATRIX: PermissionMatrixEntry[] = [
  { module: 'Patients', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Patients', action: 'Create/Update/Merge', roles: ['Admin', 'Receptionist'] },

  { module: 'Families', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Families', action: 'Create/Update/Merge', roles: ['Admin', 'Receptionist'] },

  { module: 'Medicines', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Medicines', action: 'Create/Update', roles: ['Admin', 'Pharmacist'] },

  { module: 'Consultations', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Consultations', action: 'Create/Update/Finalize/Amend', roles: ['Admin', 'Doctor'] },

  { module: 'Prescriptions', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Prescriptions', action: 'Create', roles: ['Admin', 'Doctor'] },

  { module: 'Pharmacy (Dispensing)', action: 'Read Queue/Labels', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Pharmacy (Dispensing)', action: 'Dispense/Collect/Substitute', roles: ['Admin', 'Pharmacist'] },

  { module: 'Inventory', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Inventory', action: 'Adjust/Stock-Take', roles: ['Admin', 'Pharmacist'] },

  { module: 'Suppliers', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Suppliers', action: 'Create/Update Supplier', roles: ['Admin'] },
  { module: 'Suppliers', action: 'Purchase Orders / GRN', roles: ['Admin', 'Pharmacist'] },
  { module: 'Suppliers', action: 'Discrepancy Review', roles: ['Admin'] },

  { module: 'Billing', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Billing', action: 'Create Invoice/Record Payment/Reconciliation', roles: ['Admin', 'Receptionist'] },
  { module: 'Billing', action: 'Void', roles: ['Admin'] },

  { module: 'Reports', action: 'Admin Reports (volume/revenue/top-medicines/audit-log)', roles: ['Admin'] },
  { module: 'Reports', action: 'Doctor Reports (consultations/follow-ups)', roles: ['Admin', 'Doctor'] },
  { module: 'Reports', action: 'Pharmacist Reports (stock/expiry/dispensing)', roles: ['Admin', 'Pharmacist'] },

  { module: 'Settings', action: 'Read', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'] },
  { module: 'Settings', action: 'Update Settings/Master Data/Backup & Restore', roles: ['Admin'] },

  { module: 'Security', action: 'Users & Roles / Sessions / Permission Matrix', roles: ['Admin'] },
  { module: 'Security', action: 'Two-Factor Authentication', roles: ['Admin'] },
];
