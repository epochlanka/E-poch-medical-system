import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHomeUrl, type UserRole } from '../config/roleRoutes';
import './login-confirmation.css';

const ROLE_COPY: Record<UserRole, { label: string; destination: string; icon: string; theme: string }> = {
  Admin: { label: 'Administrator', destination: 'Administration portal', icon: 'A', theme: 'admin' },
  Doctor: { label: 'Doctor', destination: 'Doctor portal', icon: '✚', theme: 'doctor' },
  Receptionist: { label: 'Receptionist', destination: 'Reception portal', icon: 'R', theme: 'receptionist' },
  Pharmacist: { label: 'Pharmacist', destination: 'Pharmacy portal', icon: 'Rx', theme: 'pharmacist' },
};

const LoginConfirmation = () => {
  const { user, loading, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

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

        <div className="login-confirm-steps" aria-label="Sign-in progress">
          <div className="login-confirm-step complete">
            <span>✓</span>
            <small>Authenticated</small>
          </div>
          <div className="login-confirm-step-line complete" />
          <div className="login-confirm-step active">
            <span>2</span>
            <small>Confirm</small>
          </div>
          <div className="login-confirm-step-line" />
          <div className="login-confirm-step">
            <span>3</span>
            <small>Enter portal</small>
          </div>
        </div>

        <p className="login-confirm-prompt">Confirm that this is your account before entering the portal.</p>

        <button className="login-confirm-primary" onClick={continueNow} disabled={leaving}>
          Confirm and continue
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
