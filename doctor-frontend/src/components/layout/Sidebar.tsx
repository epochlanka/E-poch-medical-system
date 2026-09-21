import { NavLink } from 'react-router-dom';
import { navSections } from './navConfig';

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
  return (
    <aside className={`shell-sidebar${open ? ' open' : ''}`}>
      <div className="shell-brand">
        <div className="shell-brand-icon">
          <BrandMark />
        </div>
        <div className="shell-brand-text">
          <span className="shell-brand-name">E-POCH</span>
          <span className="shell-brand-sub">MEDICAL SYSTEM</span>
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
