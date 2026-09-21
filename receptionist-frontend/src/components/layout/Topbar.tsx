import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../frontDesk/WorkspaceContext';
import { getPharmacyQueue } from '../../../../pharmacist-frontend/src/lib/pharmacy';
import type { QueueItem } from '../../../../pharmacist-frontend/src/lib/pharmacy';
import { MenuIcon } from './Icons';

export default function Topbar({ onMenuClick }: { title: string; onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const workspace = useWorkspace();
  const [queue, setQueue] = useState<{ prepare: number; handover: number } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [arrived, setArrived] = useState<QueueItem | null>(null);
  const known = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!workspace.canPharmacy) return;
    let active = true, pending = false;
    const load = async (background: boolean) => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const board = await getPharmacyQueue(background);
        if (!active) return;
        if (known.current) {
          const incoming = board.Pending.filter(item => !known.current!.has(item.prescriptionId));
          if (incoming.length) setArrived(incoming[incoming.length - 1]);
        }
        known.current = new Set([...board.Pending, ...board.Preparing, ...board.Dispensed, ...board.Collected].map(item => item.prescriptionId));
        setQueue({ prepare: board.Pending.length + board.Preparing.length, handover: board.Dispensed.length });
        setUnavailable(false);
      } catch { if (active) setUnavailable(true); }
      finally { pending = false; }
    };
    const onTimer = () => { void load(true); };
    const onVisible = () => { void load(false); };
    void load(false);
    const timer = window.setInterval(onTimer, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [workspace.canPharmacy]);
  useEffect(() => { document.title = `${queue?.prepare ? `(${queue.prepare} prescriptions) ` : ''}E-POCH Front Desk`; }, [queue]);
  const path = (location: typeof workspace.receptionLocation) => location.pathname + location.search + location.hash;
  return <>
    <header className="shell-topbar fd-topbar">
      <button className="shell-menu-btn" onClick={onMenuClick} aria-label="Toggle menu"><MenuIcon /></button>
      <div className="fd-brand"><strong>Front Desk</strong><small>Reception & pharmacy</small></div>
      <nav className="fd-switch" aria-label="Switch workspace">
        {workspace.canReception && <Link data-workspace-switch to={path(workspace.receptionLocation)} aria-current={!workspace.pharmacy ? 'page' : undefined}>Reception</Link>}
        {workspace.canPharmacy && <Link data-workspace-switch to={path(workspace.pharmacyLocation)} aria-current={workspace.pharmacy ? 'page' : undefined}>Pharmacy <span>{unavailable ? '!' : queue?.prepare ?? '…'}</span></Link>}
      </nav>
      <div className="fd-user"><strong>{user?.username}</strong><span>{user?.role === 'FrontDesk' ? 'Reception + Pharmacy' : user?.role}</span></div>
      <button className="fd-signout" onClick={() => { if (window.confirm('Sign out? Finish or save your current work first.')) void logout(); }}>Sign out</button>
    </header>
    <div className="fd-counter-bar">
      <span>{workspace.pharmacy ? 'Pick medicines and complete patient handovers.' : 'Register patients, manage the doctor’s queue, and take payments.'}</span>
      {workspace.canPharmacy && <Link to="/pharmacy/queue">{unavailable ? 'Prescription updates unavailable — open queue to retry' : `${queue?.prepare ?? '…'} to prepare · ${queue?.handover ?? '…'} ready for handover`} →</Link>}
    </div>
    {arrived && <div className="fd-arrival" role="status"><span><strong>New prescription from the doctor</strong> · {arrived.patientName} · {arrived.code}</span>{workspace.canPharmacy && <Link to={`/pharmacy/dispensing/${arrived.prescriptionId}`} onClick={() => setArrived(null)}>Open prescription →</Link>}<button aria-label="Dismiss prescription notice" onClick={() => setArrived(null)}>×</button></div>}
  </>;
}
