import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useWorkspace } from '../../frontDesk/WorkspaceContext';
import { deskNav } from '../../frontDesk/navModel';

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
  const navSections = deskNav(pharmacy);
  // Collapsed sections are controlled rather than re-keyed on the path: a section the user opened
  // stays open while they navigate, and the section holding the current page opens itself.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const active = navSections.find((section) => section.items.some((item) => pathname.startsWith(item.path)));
    if (active) setExpanded((previous) => (previous[active.label] ? previous : { ...previous, [active.label]: true }));
  }, [pathname, navSections]);

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
          const links = section.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                `shell-nav-link${isActive || (item.path === '/pharmacy/queue' && pathname.startsWith('/pharmacy/dispensing')) ? ' active' : ''}`
              }
            >
              <item.icon />
              {item.label}
              {item.leavesDeskFor && <span className="shell-nav-crossdesk">{item.leavesDeskFor}&nbsp;↗</span>}
            </NavLink>
          ));
          return pharmacy && index > 0 ? (
            <details
              className="shell-nav-section fd-nav-disclosure"
              key={section.label}
              open={!!expanded[section.label]}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setExpanded((previous) => (previous[section.label] === isOpen ? previous : { ...previous, [section.label]: isOpen }));
              }}
            >
              <summary>{section.label}</summary>
              {links}
            </details>
          ) : (
            <div className="shell-nav-section" key={section.label}>
              <div className="shell-nav-label">{section.label.toUpperCase()}</div>
              {links}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
