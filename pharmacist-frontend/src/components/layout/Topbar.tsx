import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getAlerts } from '../../lib/dashboard';
import { getPharmacyQueue } from '../../lib/pharmacy';
import type { QueueItem } from '../../lib/pharmacy';
import { Link } from 'react-router-dom';
import { MenuIcon, BellIcon, ChevronDownIcon, LogOutIcon } from './Icons';
import './pharmacy-inbox.css';

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
  const [waitingCount, setWaitingCount] = useState<number | null>(null);
  const [newPrescription, setNewPrescription] = useState<QueueItem | null>(null);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const knownPendingIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const updateWaiting = async (background = false) => {
      if (inFlight) return;
      inFlight = true;
      try {
        const board = await getPharmacyQueue(background);
        if (!active) return;
        const pending = board.Pending;
        if (knownPendingIds.current) {
          const arrived = pending.filter(rx => !knownPendingIds.current?.has(rx.prescriptionId));
          if (arrived.length) setNewPrescription(arrived[arrived.length - 1]);
          pending.forEach(rx => knownPendingIds.current?.add(rx.prescriptionId));
        } else {
          // Existing work is counted, but only prescriptions arriving after this tab
          // opens receive a "new prescription" announcement.
          knownPendingIds.current = new Set(pending.map(rx => rx.prescriptionId));
        }
        setWaitingCount(pending.length + board.Preparing.length);
        setQueueUnavailable(false);
      } catch {
        if (active) setQueueUnavailable(true);
      } finally { inFlight = false; }
    };
    void updateWaiting();
    const timer = window.setInterval(() => { void updateWaiting(true); }, 15_000);
    const onVisible = () => { if (!document.hidden) void updateWaiting(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    const original = document.title;
    document.title = waitingCount && !queueUnavailable ? `(${waitingCount} waiting) E-POCH Pharmacist Portal` : 'E-POCH Pharmacist Portal';
    return () => { document.title = original; };
  }, [waitingCount, queueUnavailable]);

  const alertsRef = useClickOutside(() => setOpenMenu((m) => (m === 'alerts' ? null : m)));
  const userRef = useClickOutside(() => setOpenMenu((m) => (m === 'user' ? null : m)));

  const toggle = (menu: 'alerts' | 'user') =>
    setOpenMenu((current) => (current === menu ? null : menu));

  return (
    <header className="shell-topbar">
      <button className="shell-menu-btn" onClick={onMenuClick} aria-label="Toggle menu">
        <MenuIcon />
      </button>

      <span className="shell-page-title">{title}</span>

      <div className="shell-topbar-spacer" />

      <div className="shell-topbar-right">
        <Link className="ph-inbox-link" to="/pharmacy/queue" aria-label={queueUnavailable ? 'Pharmacy queue unavailable' : `${waitingCount ?? 0} prescriptions waiting in pharmacy`}>
          <span className="ph-inbox-label">Waiting prescriptions</span>
          <span className="ph-inbox-count">{queueUnavailable ? '!' : waitingCount ?? '…'}</span>
        </Link>
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
              <span className="shell-user-name">{user?.username ?? 'Pharmacist'}</span>
              <span className="shell-user-role">Main Branch</span>
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
      {newPrescription && <div className="ph-new-rx" role="status"><div><strong>New prescription received</strong><span>{newPrescription.patientName} · {newPrescription.code}</span></div><Link to={`/pharmacy/dispensing/${newPrescription.prescriptionId}`} onClick={() => setNewPrescription(null)}>Open</Link><button type="button" aria-label="Dismiss new prescription notice" onClick={() => setNewPrescription(null)}>×</button></div>}
    </header>
  );
};

export default Topbar;
