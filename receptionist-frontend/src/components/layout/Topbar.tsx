import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getAlerts } from '../../lib/dashboard';
import { MenuIcon, SearchIcon, BellIcon, ChevronDownIcon, LogOutIcon } from './Icons';

const useClickOutside = (onOutside: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onOutside]);
  return ref;
};

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'U';

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

const Topbar = ({ title, onMenuClick }: TopbarProps) => {
  const { user, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState<'alerts' | 'user' | null>(null);

  const alerts = useApiData(getAlerts);

  const alertsRef = useClickOutside(() => setOpenMenu((m) => (m === 'alerts' ? null : m)));
  const userRef = useClickOutside(() => setOpenMenu((m) => (m === 'user' ? null : m)));

  const toggle = (menu: 'alerts' | 'user') =>
    setOpenMenu((current) => (current === menu ? null : menu));

  return (
    <header className="shell-topbar">
      <button className="shell-menu-btn" onClick={onMenuClick} aria-label="Toggle menu">
        <MenuIcon />
      </button>

      <div className="shell-search">
        <SearchIcon />
        <input placeholder={`Search ${title.toLowerCase()}...`} />
      </div>

      <div className="shell-topbar-spacer" />

      <div className="shell-topbar-right">
        <div className="shell-dropdown-wrap" ref={alertsRef} style={{ position: 'relative' }}>
          <button className="shell-icon-btn" onClick={() => toggle('alerts')} aria-label="Alerts">
            <BellIcon />
            {!!alerts.data?.length && (
              <span className={`shell-icon-badge${alerts.data.some((a) => a.severity === 'red') ? '' : ' amber'}`}>
                {alerts.data.length > 9 ? '9+' : alerts.data.length}
              </span>
            )}
          </button>
          {openMenu === 'alerts' && (
            <div className="shell-dropdown">
              <div className="shell-dropdown-header">Alerts &amp; Notifications</div>
              <div className="shell-dropdown-list">
                {alerts.loading && <div className="shell-dropdown-empty">Loading…</div>}
                {!alerts.loading && !alerts.data?.length && <div className="shell-dropdown-empty">No active alerts</div>}
                {alerts.data?.slice(0, 8).map((a, i) => (
                  <div className="shell-dropdown-item" key={i}>
                    <span className={`shell-dropdown-dot ${a.severity}`} />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div ref={userRef} style={{ position: 'relative' }}>
          <button className="shell-user" onClick={() => toggle('user')}>
            <div className="shell-avatar">{initials(user?.username || 'U')}</div>
            <div className="shell-user-text">
              <span className="shell-user-name">{user?.username ?? 'Receptionist'}</span>
              <span className="shell-user-role">Front Desk</span>
            </div>
            <ChevronDownIcon />
          </button>
          {openMenu === 'user' && (
            <div className="shell-user-menu">
              <button onClick={logout}>
                <LogOutIcon /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
