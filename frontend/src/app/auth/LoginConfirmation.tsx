import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  canAccessWorkspace,
  legacyPortalUrl,
  workspaceForPath,
  workspaceHome,
  workspacesForRole,
  type Workspace,
} from '../workspaces';
import './login-confirmation.css';

/**
 * Second step of signing in: the user confirms whose session this is before the workspace opens.
 * On a shared clinic workstation that is the moment someone notices the previous person never
 * signed out.
 *
 * Roles with a single workspace see their destination; FrontDesk, which covers both reception and
 * pharmacy, picks one here and can switch later without signing out.
 */
const LoginConfirmation = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [leaving, setLeaving] = useState(false);

  const choices = user ? workspacesForRole(user.role) : [];
  const [selected, setSelected] = useState<Workspace | null>(null);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const target = selected ?? choices[0];

  // The page the user was trying to reach before being asked to sign in. Honoured only when it
  // belongs to the workspace they are about to enter, so a stale link cannot drop someone into
  // another role's area (the backend would 403 them there anyway).
  const from = (location.state as { from?: string } | null)?.from;
  const fromWorkspace = from ? workspaceForPath(from) : undefined;
  const resumeHere =
    from && fromWorkspace && fromWorkspace.id === target.id && canAccessWorkspace(user.role, fromWorkspace.id)
      ? from
      : null;

  const continueNow = () => {
    setLeaving(true);
    if (target.migrated) {
      navigate(resumeHere ?? workspaceHome(target), { replace: true });
    } else {
      // Not migrated yet: hand off to the standalone portal. Same backend, same cookie, so the
      // session goes with them.
      window.location.replace(legacyPortalUrl(target));
    }
  };

  const signOut = async () => {
    setLeaving(true);
    await logout();
  };

  return (
    <main className={`login-confirm-page theme-${target.theme}`}>
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
          <div className="login-confirm-avatar" aria-hidden="true">{target.mark}</div>
          <div className="login-confirm-identity-copy">
            <span className="login-confirm-label">Signing in as</span>
            <strong>{user.username}</strong>
          </div>
          <span className="login-confirm-role">{user.role}</span>
        </div>

        {choices.length > 1 ? (
          <div className="login-confirm-choices" role="group" aria-label="Choose a workspace">
            {choices.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className={`login-confirm-choice${workspace.id === target.id ? ' selected' : ''}`}
                aria-pressed={workspace.id === target.id}
                onClick={() => setSelected(workspace)}
                disabled={leaving}
              >
                <span className="login-confirm-choice-mark" aria-hidden="true">{workspace.mark}</span>
                <span className="login-confirm-choice-copy">
                  <strong>{workspace.description}</strong>
                  <span>{workspace.migrated ? 'Opens here' : 'Opens in its own portal'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="login-confirm-route">
            <span className="login-confirm-route-dot" />
            <div>
              <span>Secure destination</span>
              <strong>{target.description}</strong>
            </div>
            <span className="login-confirm-arrow" aria-hidden="true">→</span>
          </div>
        )}

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
            <small>Enter workspace</small>
          </div>
        </div>

        <p className="login-confirm-prompt">
          {resumeHere
            ? 'Confirm that this is your account to return to where you were.'
            : 'Confirm that this is your account before entering the workspace.'}
        </p>

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
