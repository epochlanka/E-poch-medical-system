import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  canAccessWorkspace,
  homePathForRole,
  legacyPortalUrl,
  type WorkspaceId,
  WORKSPACES,
} from './workspaces';
import { WorkspaceProvider } from './WorkspaceContext';

/**
 * Route protection here is for usability — showing people only what they can use, and sending them
 * somewhere sensible otherwise. It is NOT the access control. Every API route is guarded by
 * requireRole on the backend (backend/src/middlewares/auth.ts), and a user who types a path they
 * are not entitled to still gets a 403 from the server.
 */

/** Everything below this needs a signed-in user. */
export const RequireAuth = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
};

/** Gates one workspace, and tells the pages inside it which prefix they are mounted under. */
export const RequireWorkspace = ({ id, children }: { id: WorkspaceId; children: ReactNode }) => {
  const { user, loading } = useAuth();
  const workspace = WORKSPACES[id];

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Not this user's workspace: send them to their own rather than showing a dead end.
  if (!canAccessWorkspace(user.role, id)) return <Navigate to={homePathForRole(user.role)} replace />;
  // Entitled, but this workspace has not moved into the unified app yet — hand off to its portal.
  if (!workspace.migrated) return <LegacyPortalHandoff workspaceId={id} />;

  return <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>;
};

/**
 * Bridge for a workspace that is still a standalone portal. The session cookie is set for the
 * backend's origin and the portals all talk to that same backend, so the handoff carries the
 * signed-in session with it — the user is not asked to log in again.
 *
 * Reached by anyone who lands on an unmigrated workspace's path directly (a bookmark, a typed URL).
 * The login flow sends people straight to the portal instead, so they do not see this at sign-in.
 */
const LegacyPortalHandoff = ({ workspaceId }: { workspaceId: WorkspaceId }) => {
  const workspace = WORKSPACES[workspaceId];
  const url = legacyPortalUrl(workspace);

  useEffect(() => {
    window.location.replace(url);
  }, [url]);

  return (
    <main className="handoff-page">
      <section className="handoff-card" aria-live="polite">
        <span className="handoff-spinner" aria-hidden="true" />
        <h1>Opening {workspace.label}</h1>
        <p>This workspace is still served as its own portal. Your session carries over.</p>
        <a className="handoff-link" href={url}>
          Continue if this does not open automatically
        </a>
      </section>
    </main>
  );
};

/** '/' — bounce to the right place for whoever is (or is not) signed in. */
export const RootRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homePathForRole(user.role) : '/login'} replace />;
};
