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
  FileIcon,
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
      { label: 'Skip / Recall', path: '/queue/skip-recall', icon: RefreshIcon },
    ],
  },
  {
    label: 'Consultations',
    items: [
      { label: 'Consultation Workspace', path: '/consultations/workspace', icon: ClipboardIcon },
      { label: 'My Consultations', path: '/consultations/my', icon: StethoscopeIcon },
      { label: 'Follow-ups Due', path: '/consultations/follow-ups', icon: ClockIcon },
    ],
  },
  {
    label: 'Prescriptions',
    items: [
      { label: 'New Prescription', path: '/prescriptions/new', icon: PrescriptionIcon },
      { label: 'My Prescriptions', path: '/prescriptions/my', icon: PrescriptionIcon },
      { label: 'Repeat Prescriptions', path: '/prescriptions/repeat', icon: RefreshIcon },
    ],
  },
  {
    label: 'Patients (Read Only)',
    items: [
      { label: 'Patient Search', path: '/patients/search', icon: SearchIcon },
      { label: 'Patient History', path: '/patients/history', icon: FileIcon },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'My Reports', path: '/reports/my', icon: ReportsIcon },
      { label: 'Clinical Statistics', path: '/reports/clinical-statistics', icon: ReportsIcon },
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
