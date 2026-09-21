import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { findNavLabel } from './navConfig';
import './app-shell.css';

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);

  return (
    <div className="shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className={`shell-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="shell-main">
        <Topbar title={findNavLabel(location.pathname)} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <div className="shell-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
