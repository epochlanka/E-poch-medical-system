import type { ComponentType } from 'react';
import {
  DashboardIcon,
  CalendarIcon,
  PhoneIcon,
  RefreshIcon,
  ClipboardIcon,
  StethoscopeIcon,
  ClockIcon,
  PrescriptionIcon,
  SearchIcon,
  ReportsIcon,
  HeartPulseIcon,
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

// Mirrors doctor-Epoch_Medical_System_SRS.md Section 3 (Sidebar / Menu — Doctor View).
export const navSections: NavSection[] = [
  {
    label: 'Main',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, implemented: true }],
  },
  {
    label: 'Appointments & Queue',
    items: [
      { label: 'Live Queue', path: '/queue/live', icon: CalendarIcon, implemented: true },
      { label: 'Call Next', path: '/queue/call-next', icon: PhoneIcon, implemented: true },
      { label: 'Skip / Recall', path: '/queue/skip-recall', icon: RefreshIcon, implemented: true },
    ],
  },
  {
    label: 'Consultations',
    items: [
      { label: 'Consultation Workspace', path: '/consultations/workspace', icon: ClipboardIcon, implemented: true },
      { label: 'My Consultations', path: '/consultations/my', icon: StethoscopeIcon, implemented: true },
      { label: 'Follow-ups Due', path: '/consultations/follow-ups', icon: ClockIcon, implemented: true },
    ],
  },
  {
    label: 'Prescriptions',
    items: [
      { label: 'New Prescription', path: '/prescriptions/new', icon: PrescriptionIcon, implemented: true },
      { label: 'My Prescriptions', path: '/prescriptions/my', icon: PrescriptionIcon, implemented: true },
      { label: 'Repeat Prescriptions', path: '/prescriptions/repeat', icon: RefreshIcon, implemented: true },
    ],
  },
  {
    label: 'Lab Tests',
    items: [{ label: 'My Lab Reports', path: '/lab-reports/my', icon: HeartPulseIcon, implemented: true }],
  },
  {
    label: 'Patients (Read Only)',
    items: [{ label: 'Patient Search', path: '/patients/search', icon: SearchIcon, implemented: true }],
  },
  {
    label: 'Reports',
    items: [
      { label: 'My Reports', path: '/reports/my', icon: ReportsIcon, implemented: true },
      { label: 'Clinical Statistics', path: '/reports/clinical-statistics', icon: ReportsIcon, implemented: true },
    ],
  },
];

export const findNavLabel = (path: string): string => {
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Doctor Portal';
};
