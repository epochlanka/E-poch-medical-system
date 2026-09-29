import type { ComponentType } from 'react';
import { navSections as receptionSections } from '../components/layout/navConfig';
import { navSections as pharmacySections } from '../../../pharmacist-frontend/src/components/layout/navConfig';
import { isPharmacyPath } from './WorkspaceContext';

export type Desk = 'Reception' | 'Pharmacy';

export interface DeskNavItem {
  label: string;
  path: string;
  icon: ComponentType;
  /** Set when following this item leaves the desk whose menu it appears in. */
  leavesDeskFor?: Desk;
}

export interface DeskNavSection {
  label: string;
  items: DeskNavItem[];
}

// Reception lists a few not-yet-built screens in navConfig so the SRS mapping stays visible;
// only the implemented ones belong in the menu.
export const receptionNav: DeskNavSection[] = receptionSections
  .map((section) => ({ ...section, items: section.items.filter((item) => item.implemented) }))
  .filter((section) => section.items.length > 0);

// Billing is one shared ledger owned by Reception, so the pharmacy's entry point is a cross-desk
// link rather than a screen of its own — flagged here so the menu can say so before it is clicked.
// The overview lives in the reception dashboard when both desks are in one portal.
export const pharmacyNav: DeskNavSection[] = pharmacySections
  .map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.path !== '/overview')
      .map((item) =>
        item.path === '/billing'
          ? { ...item, label: 'Invoices & payments', path: '/billing/invoices', leavesDeskFor: 'Reception' as Desk }
          : item,
      ),
  }))
  .filter((section) => section.items.length > 0);

export const deskNav = (pharmacy: boolean): DeskNavSection[] => (pharmacy ? pharmacyNav : receptionNav);

export interface Crumb {
  desk: Desk;
  section: string | null;
  label: string;
}

/** Screens reached from another screen rather than from the menu, so they have no nav entry. */
const nested: { prefix: string; section: string; label: string }[] = [
  { prefix: '/pharmacy/dispensing', section: 'Serve patients', label: 'Pick medicines' },
  { prefix: '/families/roster/', section: 'Families', label: 'Family Member Roster' },
];

/** Where the current route sits, for the topbar. Longest path match wins so nested routes resolve. */
export const resolveCrumb = (pathname: string): Crumb => {
  const desk: Desk = isPharmacyPath(pathname) ? 'Pharmacy' : 'Reception';
  const sections = desk === 'Pharmacy' ? pharmacyNav : receptionNav;

  let best: { crumb: Crumb; depth: number } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (!pathname.startsWith(item.path)) continue;
      if (best && best.depth >= item.path.length) continue;
      best = { crumb: { desk, section: section.label, label: item.label }, depth: item.path.length };
    }
  }

  const deeper = nested.find((entry) => pathname.startsWith(entry.prefix));
  if (deeper) return { desk, section: deeper.section, label: deeper.label };
  return best?.crumb ?? { desk, section: null, label: desk === 'Pharmacy' ? 'Pharmacy' : 'Reception' };
};
