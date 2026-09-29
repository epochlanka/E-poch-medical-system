import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { findNavLabel } from './navConfig';
import { useWorkspace } from '../../app/WorkspaceContext';
import './app-shell.css';

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const workspace = useWorkspace();
  const localPath = location.pathname.slice(workspace.base.length) || '/';

  return (
    <div className="shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className={`shell-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="shell-main">
        <Topbar title={findNavLabel(localPath)} onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
