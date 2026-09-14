import type { ComponentType } from 'react';
import {
  DashboardIcon,
  PrescriptionIcon,
  PharmacyIcon,
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

// Counter work comes first; operational tools are disclosed separately.
export const navSections: NavSection[] = [
  {
    label: 'Serve patients',
    items: [
      { label: 'Waiting prescriptions', path: '/pharmacy/queue', icon: PharmacyIcon, implemented: true },
      { label: 'Prescription records', path: '/prescriptions', icon: PrescriptionIcon, implemented: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Medicine Catalog', path: '/inventory/medicines', icon: MedicineIcon, implemented: true },
      { label: 'Batches & expiry', path: '/inventory/batches', icon: ClipboardIcon, implemented: true },
      { label: 'Stock history', path: '/inventory/stock-ledger', icon: StockIcon, implemented: true },
      { label: 'Low stock', path: '/inventory/low-stock', icon: AlertIcon, implemented: true },
      { label: 'Expiry alerts', path: '/inventory/expiry-alerts', icon: ExpiryIcon, implemented: true },
      { label: 'Count stock', path: '/inventory/stock-take', icon: CheckCircleIcon, implemented: true },
      { label: 'Correct stock', path: '/inventory/adjustment', icon: AdjustIcon, implemented: true },
    ],
  },
  {
    label: 'Order & receive',
    items: [
      { label: 'Suppliers', path: '/suppliers', icon: SupplierIcon, implemented: true },
      { label: 'Purchase Orders', path: '/purchase-orders', icon: PurchaseOrderIcon, implemented: true },
      { label: 'Receive delivery', path: '/goods-received', icon: TruckIcon, implemented: true },
      { label: 'Delivery differences', path: '/grn-review', icon: FileIcon, implemented: true },
    ],
  },
  {
    label: 'Billing',
    items: [{ label: 'Pharmacy charges', path: '/billing', icon: InvoiceIcon, implemented: true }],
  },
  {
    label: 'Overview & settings',
    items: [
      { label: 'Pharmacy overview', path: '/overview', icon: DashboardIcon, implemented: true },
      { label: 'Pharmacy reports', path: '/reports', icon: ReportsIcon, implemented: true },
      { label: 'Substitution rules', path: '/pharmacy/substitution-rules', icon: RefreshIcon, implemented: true },
    ],
  },
];

export const findNavLabel = (path: string): string => {
  if (path.startsWith('/pharmacy/dispensing')) return 'Pick medicines';
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Pharmacist Portal';
};
