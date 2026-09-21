import { NavLink } from 'react-router-dom';
import { navSections } from './navConfig';

const HeartPulseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 0 0-8-2.5A4.5 4.5 0 0 0 6 8c0 2.5 1.5 4.5 3 6l5 6 5-6Z" />
    <path d="M3 12h4l1.5-3L11 15l1.5-4L14 12h3" />
  </svg>
);

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

const Sidebar = ({ open, onNavigate }: SidebarProps) => {
  return (
    <aside className={`shell-sidebar${open ? ' open' : ''}`}>
      <div className="shell-brand">
        <div className="shell-brand-icon">
          <HeartPulseIcon />
        </div>
        <div className="shell-brand-text">
          <span className="shell-brand-name">Medi<b>Care</b></span>
          <span className="shell-brand-sub">Clinic &amp; Dispensary</span>
        </div>
      </div>

      <nav className="shell-nav">
        {navSections.map((section) => (
          <div className="shell-nav-section" key={section.label}>
            <div className="shell-nav-label">{section.label.toUpperCase()}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) => `shell-nav-link${isActive ? ' active' : ''}`}
              >
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
