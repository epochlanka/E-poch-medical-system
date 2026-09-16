import { navSections as pharmacySections } from '../../../../pharmacist-frontend/src/components/layout/navConfig';
import { useWorkspace } from '../../frontDesk/WorkspaceContext';
import { NavLink, useLocation } from 'react-router-dom';
import { navSections as receptionSections } from './navConfig';

const BrandMark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h4l1.5-4L12 16l1.5-5L15 12h5" />
  </svg>
);

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

const Sidebar = ({ open, onNavigate }: SidebarProps) => {
  const { pharmacy } = useWorkspace();
  const { pathname } = useLocation();
  const navSections = pharmacy
    ? pharmacySections.map(section => ({ ...section, items: section.items.filter(item => item.path !== '/overview').map(item => item.path === '/billing' ? { ...item, label: 'Invoices & payments', path: '/billing/invoices' } : item) })).filter(section => section.items.length)
    : receptionSections.map(section => ({ ...section, items: section.items.filter(item => item.implemented) })).filter(section => section.items.length);
  return (
    <aside className={`shell-sidebar${open ? ' open' : ''}`}>
      <div className="shell-brand">
        <div className="shell-brand-icon">
          <BrandMark />
        </div>
        <div className="shell-brand-text">
          <span className="shell-brand-name">E-POCH</span>
          <span className="shell-brand-sub">FRONT DESK</span>
        </div>
      </div>

      <nav className="shell-nav">
        {navSections.map((section, index) => {
          const links = section.items.map(item => (
            <NavLink key={item.path} to={item.path} onClick={onNavigate}
              className={({ isActive }) => `shell-nav-link${isActive || (item.path === '/pharmacy/queue' && pathname.startsWith('/pharmacy/dispensing')) ? ' active' : ''}`}>
              <item.icon />{item.label}
            </NavLink>
          ));
          return pharmacy && index > 0 ? (
            <details className="shell-nav-section fd-nav-disclosure" key={`${section.label}-${pathname}`} open={section.items.some(item => pathname.startsWith(item.path))}>
              <summary>{section.label}</summary>{links}
            </details>
          ) : (
            <div className="shell-nav-section" key={section.label}>
              <div className="shell-nav-label">{section.label.toUpperCase()}</div>{links}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
