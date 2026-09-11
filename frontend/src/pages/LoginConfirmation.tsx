import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHomeUrl, type UserRole } from '../config/roleRoutes';
import './login-confirmation.css';

const DISPLAY_MS = 5_000;
const TICK_MS = 50;

const ROLE_COPY: Record<UserRole, { label: string; destination: string; icon: string; theme: string }> = {
  Admin: { label: 'Administrator', destination: 'Administration portal', icon: 'A', theme: 'admin' },
  Doctor: { label: 'Doctor', destination: 'Doctor portal', icon: '✚', theme: 'doctor' },
  Receptionist: { label: 'Receptionist', destination: 'Reception portal', icon: 'R', theme: 'receptionist' },
  Pharmacist: { label: 'Pharmacist', destination: 'Pharmacy portal', icon: 'Rx', theme: 'pharmacist' },
};

const LoginConfirmation = () => {
  const { user, loading, logout } = useAuth();
  const [remainingMs, setRemainingMs] = useState(DISPLAY_MS);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!user || leaving) return;

    // Anchor the countdown when this screen is actually painted. A single monotonic clock avoids
    // shortened redirects caused by queued timers, rerenders, or development Strict Mode.
    const deadline = performance.now() + DISPLAY_MS;
    let redirected = false;

    const tick = () => {
      const remaining = Math.max(0, deadline - performance.now());
      setRemainingMs(remaining);

      if (remaining === 0 && !redirected) {
        redirected = true;
        window.location.replace(roleHomeUrl(user.role));
      }
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [user, leaving]);

  const progress = useMemo(() => Math.min(100, Math.max(0, ((DISPLAY_MS - remainingMs) / DISPLAY_MS) * 100)), [remainingMs]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = ROLE_COPY[user.role];
  const continueNow = () => {
    setLeaving(true);
    window.location.replace(roleHomeUrl(user.role));
  };
  const signOut = async () => {
    setLeaving(true);
    await logout();
  };

  return (
    <main className={`login-confirm-page theme-${role.theme}`}>
      <div className="login-confirm-orb login-confirm-orb-one" />
      <div className="login-confirm-orb login-confirm-orb-two" />

      <section className="login-confirm-card" aria-live="polite">
        <div className="login-confirm-brand">
          <span className="login-confirm-brand-mark" aria-hidden="true">♥</span>
          <span>E-Poch Medical</span>
        </div>

        <div className="login-confirm-success" aria-hidden="true">
          <span>✓</span>
        </div>
        <p className="login-confirm-eyebrow">Identity verified</p>
        <h1>Welcome back, {user.username}</h1>
        <p className="login-confirm-intro">Your secure session is ready.</p>

        <div className="login-confirm-identity">
          <div className="login-confirm-avatar" aria-hidden="true">{role.icon}</div>
          <div className="login-confirm-identity-copy">
            <span className="login-confirm-label">Signing in as</span>
            <strong>{user.username}</strong>
          </div>
          <span className="login-confirm-role">{role.label}</span>
        </div>

        <div className="login-confirm-route">
          <span className="login-confirm-route-dot" />
          <div>
            <span>Secure destination</span>
            <strong>{role.destination}</strong>
          </div>
          <span className="login-confirm-arrow" aria-hidden="true">→</span>
        </div>

        <div className="login-confirm-progress-copy">
          <span>Preparing your workspace</span>
          <span>{(remainingMs / 1000).toFixed(1)}s</span>
        </div>
        <div
          className="login-confirm-progress-track"
          role="progressbar"
          aria-label="Time until portal redirect"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="login-confirm-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <button className="login-confirm-primary" onClick={continueNow} disabled={leaving}>
          Continue to {role.destination}
          <span aria-hidden="true">→</span>
        </button>
        <button className="login-confirm-secondary" onClick={() => void signOut()} disabled={leaving}>
          Not you? Sign out
        </button>

        <p className="login-confirm-security-note">
          <span aria-hidden="true">◆</span> Protected by a secure, role-verified session
        </p>
      </section>
    </main>
  );
};

export default LoginConfirmation;
