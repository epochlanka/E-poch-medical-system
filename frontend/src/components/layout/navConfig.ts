import type { ComponentType } from 'react';
import {
  DashboardIcon,
  PatientsIcon,
  FamiliesIcon,
  CalendarIcon,
  StethoscopeIcon,
  PrescriptionIcon,
  PharmacyIcon,
  MedicineIcon,
  StockIcon,
  PurchaseOrderIcon,
  SupplierIcon,
  InvoiceIcon,
  PaymentIcon,
  ReportsIcon,
  UsersIcon,
  SettingsIcon,
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

export const navSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, implemented: true },
      { label: 'Patients', path: '/patients', icon: PatientsIcon, implemented: true },
      { label: 'Families', path: '/families', icon: FamiliesIcon, implemented: true },
      { label: 'Appointments', path: '/appointments', icon: CalendarIcon, implemented: true },
      { label: 'Live Queue', path: '/queue', icon: CalendarIcon, implemented: true },
      { label: 'Book Appointment', path: '/book-appointment', icon: CalendarIcon, implemented: true },
      { label: 'Consultations', path: '/consultations', icon: StethoscopeIcon, implemented: true },
      { label: 'Prescriptions', path: '/prescriptions', icon: PrescriptionIcon, implemented: true },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Pharmacy', path: '/pharmacy', icon: PharmacyIcon, implemented: true },
      { label: 'Medicines', path: '/inventory/medicines', icon: MedicineIcon, implemented: true },
      { label: 'Stock Management', path: '/inventory/stock', icon: StockIcon, implemented: true },
      { label: 'Purchase Orders', path: '/inventory/purchase-orders', icon: PurchaseOrderIcon, implemented: true },
      { label: 'Suppliers', path: '/suppliers', icon: SupplierIcon, implemented: true },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', path: '/billing/invoices', icon: InvoiceIcon, implemented: true },
      { label: 'Payments', path: '/billing/payments', icon: PaymentIcon, implemented: true },
    ],
  },
  {
    label: 'Reports',
    items: [{ label: 'Reports & Analytics', path: '/reports', icon: ReportsIcon, implemented: true }],
  },
  {
    label: 'System',
    items: [
      { label: 'Users & Roles', path: '/users', icon: UsersIcon, implemented: true },
      { label: 'Settings', path: '/settings', icon: SettingsIcon, implemented: true },
    ],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-Poch Medical System';
};
