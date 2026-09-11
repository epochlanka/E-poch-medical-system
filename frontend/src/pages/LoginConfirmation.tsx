import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleHomeUrl, type UserRole } from '../config/roleRoutes';

const ROLE_COPY: Record<UserRole, { label: string; destination: string; color: string; background: string }> = {
  Admin: { label: 'Administrator', destination: 'Administration portal', color: '#1d4ed8', background: '#dbeafe' },
  Doctor: { label: 'Doctor', destination: 'Doctor portal', color: '#047857', background: '#d1fae5' },
  Receptionist: { label: 'Receptionist', destination: 'Reception portal', color: '#7c3aed', background: '#ede9fe' },
  Pharmacist: { label: 'Pharmacist', destination: 'Pharmacy portal', color: '#b45309', background: '#fef3c7' },
};

const LoginConfirmation = () => {
  const { user, loading, logout } = useAuth();
  const [seconds, setSeconds] = useState(4);

  useEffect(() => {
    if (!user) return;

    const countdown = window.setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    const redirect = window.setTimeout(() => window.location.replace(roleHomeUrl(user.role)), 4000);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(redirect);
    };
  }, [user]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const role = ROLE_COPY[user.role];

  return (
    <main style={styles.page}>
      <section style={styles.card} aria-live="polite">
        <div style={{ ...styles.icon, color: role.color, background: role.background }} aria-hidden="true">
          ✓
        </div>
        <p style={styles.eyebrow}>Sign-in successful</p>
        <h1 style={styles.heading}>Welcome, {user.username}</h1>
        <p style={styles.message}>Your identity has been verified. You are signing in as:</p>
        <div style={{ ...styles.roleBadge, color: role.color, background: role.background }}>{role.label}</div>
        <p style={styles.destination}>
          Continuing to the <strong>{role.destination}</strong> in {seconds} second{seconds === 1 ? '' : 's'}…
        </p>
        <button style={styles.primaryButton} onClick={() => window.location.replace(roleHomeUrl(user.role))}>
          Continue now
        </button>
        <button style={styles.secondaryButton} onClick={() => void logout()}>
          Not you? Sign out
        </button>
        <div style={styles.progressTrack} aria-hidden="true">
          <div style={styles.progressBar} />
        </div>
      </section>
    </main>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #ecfdf5 100%)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: 'min(100%, 460px)',
    padding: '42px 38px 34px',
    textAlign: 'center',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 22,
    boxShadow: '0 24px 70px rgba(15, 23, 42, 0.12)',
    overflow: 'hidden',
  },
  icon: {
    width: 64,
    height: 64,
    display: 'grid',
    placeItems: 'center',
    margin: '0 auto 20px',
    borderRadius: '50%',
    fontSize: 30,
    fontWeight: 800,
  },
  eyebrow: {
    margin: '0 0 8px',
    color: '#64748b',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  heading: { margin: 0, color: '#0f172a', fontSize: 30, lineHeight: 1.2 },
  message: { margin: '14px 0 16px', color: '#64748b', fontSize: 15, lineHeight: 1.6 },
  roleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
    padding: '9px 16px',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 800,
  },
  destination: { margin: '20px 0 24px', color: '#475569', fontSize: 14, lineHeight: 1.55 },
  primaryButton: {
    width: '100%',
    padding: '12px 18px',
    border: 0,
    borderRadius: 10,
    background: '#2563eb',
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 750,
    cursor: 'pointer',
  },
  secondaryButton: {
    width: '100%',
    marginTop: 10,
    padding: '11px 18px',
    border: 0,
    background: 'transparent',
    color: '#64748b',
    fontSize: 14,
    fontWeight: 650,
    cursor: 'pointer',
  },
  progressTrack: {
    height: 3,
    margin: '24px -38px -34px',
    background: '#e2e8f0',
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #2563eb, #10b981)',
    animation: 'login-confirm-progress 4s linear forwards',
  },
};

export default LoginConfirmation;
