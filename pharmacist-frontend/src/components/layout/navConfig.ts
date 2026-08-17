import type { ComponentType } from 'react';
import {
  DashboardIcon,
  PrescriptionIcon,
  PharmacyIcon,
  PillIcon,
  SendIcon,
  RefreshIcon,
  MedicineIcon,
  ClipboardIcon,
  StockIcon,
  AlertIcon,
  ExpiryIcon,
  CheckCircleIcon,
  AdjustIcon,
  SupplierIcon,
  PurchaseOrderIcon,
  TruckIcon,
  FileIcon,
  InvoiceIcon,
  ReportsIcon,
} from './Icons';

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType;
  implemented?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// Mirrors pharmacist-Epoch_Medical_System_SRS.md Section 3 (Sidebar / Menu — Pharmacist View).
export const navSections: NavSection[] = [
  {
    label: 'Pharmacy',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, implemented: true },
      { label: 'Prescriptions', path: '/prescriptions', icon: PrescriptionIcon, implemented: true },
    ],
  },
  {
    label: 'Pharmacy',
    items: [
      { label: 'Pharmacy Queue', path: '/pharmacy/queue', icon: PharmacyIcon },
      { label: 'Dispensing', path: '/pharmacy/dispensing', icon: PillIcon },
      { label: 'Partial Dispense', path: '/pharmacy/partial-dispense', icon: SendIcon },
      { label: 'Substitution Rules', path: '/pharmacy/substitution-rules', icon: RefreshIcon },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Medicine Catalog', path: '/inventory/medicines', icon: MedicineIcon },
      { label: 'Batch & Expiry', path: '/inventory/batches', icon: ClipboardIcon },
      { label: 'Stock Ledger', path: '/inventory/stock-ledger', icon: StockIcon },
      { label: 'Low Stock Alerts', path: '/inventory/low-stock', icon: AlertIcon },
      { label: 'Expiry Alerts', path: '/inventory/expiry-alerts', icon: ExpiryIcon },
      { label: 'Stock Take', path: '/inventory/stock-take', icon: CheckCircleIcon },
      { label: 'Manual Adjustment', path: '/inventory/adjustment', icon: AdjustIcon },
    ],
  },
  {
    label: 'Suppliers & Purchases',
    items: [
      { label: 'Suppliers', path: '/suppliers', icon: SupplierIcon },
      { label: 'Purchase Orders', path: '/purchase-orders', icon: PurchaseOrderIcon },
      { label: 'Goods Received', path: '/goods-received', icon: TruckIcon },
      { label: 'GRN Review', path: '/grn-review', icon: FileIcon },
    ],
  },
  {
    label: 'Billing',
    items: [{ label: 'Pharmacy Billing', path: '/billing', icon: InvoiceIcon }],
  },
  {
    label: 'Reports',
    items: [{ label: 'Reports & Analytics', path: '/reports', icon: ReportsIcon }],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Pharmacist Portal';
};
