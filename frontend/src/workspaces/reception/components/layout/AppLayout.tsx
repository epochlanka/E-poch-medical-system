import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspace } from '../../frontDesk/WorkspaceContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './app-shell.css';

const AppLayout = ({ children }: { children: ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pharmacy } = useWorkspace();
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="shell" data-desk={pharmacy ? 'pharmacy' : 'reception'}>
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className={`shell-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="shell-main">
        <Topbar onMenuClick={() => setSidebarOpen((v) => !v)} />
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
};

export default AppLayout;
