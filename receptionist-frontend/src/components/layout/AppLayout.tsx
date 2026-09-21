import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { findNavLabel } from './navConfig';
import './app-shell.css';

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className={`shell-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="shell-main">
        <Topbar title={findNavLabel(location.pathname)} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
};

export default AppLayout;
