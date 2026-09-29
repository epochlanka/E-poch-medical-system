import type { ComponentType } from 'react';
import { navSections as receptionSections } from '../components/layout/navConfig';
import { navSections as pharmacySections } from '../../pharmacy/components/layout/navConfig';
import { deskPath, isPharmacyPath } from './WorkspaceContext';

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
  .map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.implemented)
      .map((item) => ({ ...item, path: deskPath('Reception', item.path) })),
  }))
  .filter((section) => section.items.length > 0);

// Billing is one shared ledger owned by Reception, so the pharmacy's entry point is a cross-desk
// link rather than a screen of its own — flagged here so the menu can say so before it is clicked.
// The overview lives in the reception dashboard when both desks are in one portal.
const buildPharmacyNav = (canReception: boolean): DeskNavSection[] =>
  pharmacySections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => !(canReception && item.path === '/overview'))
        .map((item) =>
          item.path === '/billing' && canReception
            ? {
                ...item,
                label: 'Invoices & payments',
                path: deskPath('Reception', '/billing/invoices'),
                leavesDeskFor: 'Reception' as Desk,
              }
            : { ...item, path: deskPath('Pharmacy', item.path) },
        ),
    }))
    .filter((section) => section.items.length > 0);

/** Front desk staff see the shared ledger; a pharmacist-only account keeps its own screens. */
export const pharmacyNav = buildPharmacyNav(true);
const pharmacyOnlyNav = buildPharmacyNav(false);

export const deskNav = (pharmacy: boolean, canReception = true): DeskNavSection[] =>
  pharmacy ? (canReception ? pharmacyNav : pharmacyOnlyNav) : receptionNav;

export interface Crumb {
  desk: Desk;
  section: string | null;
  label: string;
}

/** Screens reached from another screen rather than from the menu, so they have no nav entry. */
const nested: { prefix: string; section: string; label: string }[] = [
  { prefix: deskPath('Pharmacy', '/dispensing'), section: 'Serve patients', label: 'Pick medicines' },
  { prefix: deskPath('Reception', '/families/roster/'), section: 'Families', label: 'Family Member Roster' },
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
