import type { ComponentType } from 'react';
import {
  DashboardIcon,
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
    label: 'Clinical day',
    items: [
      { label: 'Today', path: '/dashboard', icon: DashboardIcon, implemented: true },
      { label: 'My Consultations', path: '/consultations/my', icon: StethoscopeIcon, implemented: true },
    ],
  },
  {
    label: 'Clinical inbox',
    items: [
      { label: 'Lab Results', path: '/lab-reports/my', icon: HeartPulseIcon, implemented: true },
      { label: 'Follow-ups Due', path: '/consultations/follow-ups', icon: ClockIcon, implemented: true },
    ],
  },
  {
    label: 'Records',
    items: [
      { label: 'Patient Search', path: '/patients/search', icon: SearchIcon, implemented: true },
      { label: 'Prescriptions', path: '/prescriptions/my', icon: PrescriptionIcon, implemented: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Activity Reports', path: '/reports/my', icon: ReportsIcon, implemented: true },
      { label: 'Clinical Statistics', path: '/reports/clinical-statistics', icon: ReportsIcon, implemented: true },
    ],
  },
];

export const findNavLabel = (path: string): string => {
  if (path.startsWith('/consultations/workspace')) return 'Rapid Consultation';
  if (path.startsWith('/queue')) return 'Patient Queue';
  if (path.startsWith('/prescriptions/new') || path.startsWith('/prescriptions/repeat')) return 'Medicines';
  for (const section of navSections) {
    const match = section.items.find((item) => path.startsWith(item.path));
    if (match) return match.label;
  }
  return 'E-POCH Doctor Portal';
};
