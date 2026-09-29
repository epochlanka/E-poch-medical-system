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

// Covers receptionist-Epoch_Medical_System_SRS.md Section 3 (Sidebar / Menu — Receptionist View).
// Wording is deliberately plain and task-first rather than the SRS's system nouns, matching the
// pharmacy side of the front desk; the `path` of each item is the stable link back to the SRS.
export const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Front desk overview', path: '/dashboard', icon: DashboardIcon, implemented: true }],
  },
  {
    label: 'Patients',
    items: [
      { label: 'Find a patient', path: '/patients/all', icon: PatientsIcon, implemented: true },
      { label: 'Register a patient', path: '/patients/register', icon: UserPlusIcon, implemented: true },
      { label: 'Possible duplicates', path: '/patients/duplicates', icon: AlertIcon, implemented: true },
      { label: 'Take a patient photo', path: '/patients/photo-capture', icon: CameraIcon },
    ],
  },
  {
    label: 'Families',
    items: [
      { label: 'All families', path: '/families/directory', icon: FamiliesIcon, implemented: true },
      { label: 'Family members', path: '/families/roster', icon: UsersIcon, implemented: true },
      { label: 'Head of family', path: '/families/head-of-family', icon: StarIcon, implemented: true },
      { label: 'Merge families', path: '/families/merge', icon: MergeIcon },
    ],
  },
  {
    label: "Today's visits",
    items: [
      { label: "Today's patient flow", path: '/queue/live', icon: ClockIcon, implemented: true },
      { label: 'Book an appointment', path: '/appointments/book', icon: CalendarIcon, implemented: true },
      { label: 'Add a walk-in', path: '/appointments/walk-in', icon: UserPlusIcon, implemented: true },
      { label: 'Skipped & recalled', path: '/queue/skip-recall', icon: RefreshIcon, implemented: true },
    ],
  },
  {
    label: 'Lab tests',
    items: [{ label: 'Lab test orders', path: '/lab-tests/queue', icon: ClipboardIcon, implemented: true }],
  },
  {
    label: 'Billing',
    items: [
      { label: 'Invoices', path: '/billing/invoices', icon: InvoiceIcon, implemented: true },
      { label: 'Payments', path: '/billing/payments', icon: PaymentIcon, implemented: true },
      { label: 'Discounts', path: '/billing/discounts', icon: DollarIcon },
      { label: 'Unpaid balances', path: '/billing/outstanding', icon: AlertIcon },
      { label: 'End-of-day cash count', path: '/billing/reconciliation', icon: CheckCircleIcon },
    ],
  },
  {
    label: 'Reports',
    items: [{ label: 'Front desk reports', path: '/reports/operational', icon: ReportsIcon }],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Receptionist Portal';
};
