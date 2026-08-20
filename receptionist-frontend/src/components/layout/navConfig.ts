import type { ComponentType } from 'react';
import {
  DashboardIcon,
  PatientsIcon,
  UserPlusIcon,
  AlertIcon,
  CameraIcon,
  FamiliesIcon,
  UsersIcon,
  StarIcon,
  MergeIcon,
  CalendarIcon,
  ClockIcon,
  RefreshIcon,
  InvoiceIcon,
  PaymentIcon,
  DollarIcon,
  CheckCircleIcon,
  ReportsIcon,
  ClipboardIcon,
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

// Mirrors receptionist-Epoch_Medical_System_SRS.md Section 3 (Sidebar / Menu — Receptionist View).
export const navSections: NavSection[] = [
  {
    label: 'Main',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, implemented: true }],
  },
  {
    label: 'Patients',
    items: [
      { label: 'All Patients', path: '/patients/all', icon: PatientsIcon, implemented: true },
      { label: 'Register New Patient', path: '/patients/register', icon: UserPlusIcon, implemented: true },
      { label: 'Duplicate Review', path: '/patients/duplicates', icon: AlertIcon, implemented: true },
      { label: 'Patient Photo Capture', path: '/patients/photo-capture', icon: CameraIcon },
    ],
  },
  {
    label: 'Families',
    items: [
      { label: 'Family Directory', path: '/families/directory', icon: FamiliesIcon, implemented: true },
      { label: 'Family Member Roster', path: '/families/roster', icon: UsersIcon, implemented: true },
      { label: 'Head of Family', path: '/families/head-of-family', icon: StarIcon, implemented: true },
      { label: 'Family Merge', path: '/families/merge', icon: MergeIcon },
    ],
  },
  {
    label: 'Appointments & Queue',
    items: [
      { label: 'Book Appointment', path: '/appointments/book', icon: CalendarIcon, implemented: true },
      { label: 'Walk-in / Add to Queue', path: '/appointments/walk-in', icon: UserPlusIcon, implemented: true },
      { label: 'Live Queue Board', path: '/queue/live', icon: ClockIcon, implemented: true },
      { label: 'Skip / Recall Log', path: '/queue/skip-recall', icon: RefreshIcon, implemented: true },
    ],
  },
  {
    label: 'Lab Tests',
    items: [{ label: 'Lab Test Orders', path: '/lab-tests/queue', icon: ClipboardIcon, implemented: true }],
  },
  {
    label: 'Billing',
    items: [
      { label: 'Consolidated Invoice', path: '/billing/invoices', icon: InvoiceIcon, implemented: true },
      { label: 'Payments', path: '/billing/payments', icon: PaymentIcon, implemented: true },
      { label: 'Discounts', path: '/billing/discounts', icon: DollarIcon },
      { label: 'Outstanding Balances', path: '/billing/outstanding', icon: AlertIcon },
      { label: 'End-of-Day Reconciliation', path: '/billing/reconciliation', icon: CheckCircleIcon },
    ],
  },
  {
    label: 'Reports',
    items: [{ label: 'Operational Reports', path: '/reports/operational', icon: ReportsIcon }],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Receptionist Portal';
};
