import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth, RequireWorkspace, RootRedirect } from './app/guards';
import Login from './app/auth/Login';
import LoginConfirmation from './app/auth/LoginConfirmation';
import { homePathForRole } from './app/workspaces';

/**
 * The unified E-Poch application shell.
 *
 * One address, one login, one session. After signing in, the user's role decides which workspace
 * loads; workspaces are code-split, so a receptionist's browser never downloads the clinical or
 * administration bundles.
 *
 * Workspaces still being migrated out of their standalone portals are declared here anyway — the
 * guard hands those users off to the existing portal (see app/workspaces.ts), so the shared login
 * works for every role before the migration finishes.
 */

const AdminWorkspace = lazy(() => import('./workspaces/admin'));
const DoctorWorkspace = lazy(() => import('./workspaces/doctor'));
const ReceptionWorkspace = lazy(() => import('./workspaces/reception'));
const PharmacyWorkspace = lazy(() => import('./workspaces/pharmacy'));

const WorkspaceFallback = () => null;

const LoginEntry = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  // Already signed in: don't show the form again, go and confirm the session instead.
  if (user) return <Navigate to="/login/confirm" replace />;
  return <Login />;
};

const App = () => (
  <AuthProvider>
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginEntry />} />
      <Route path="/login/confirm" element={<LoginConfirmation />} />

      <Route element={<RequireAuth />}>
        <Route
          path="/admin/*"
          element={
            <RequireWorkspace id="admin">
              <Suspense fallback={<WorkspaceFallback />}>
                <AdminWorkspace />
              </Suspense>
            </RequireWorkspace>
          }
        />
        <Route
          path="/doctor/*"
          element={
            <RequireWorkspace id="doctor">
              <Suspense fallback={<WorkspaceFallback />}>
                <DoctorWorkspace />
              </Suspense>
            </RequireWorkspace>
          }
        />
        <Route
          path="/reception/*"
          element={
            <RequireWorkspace id="reception">
              <Suspense fallback={<WorkspaceFallback />}>
                <ReceptionWorkspace />
              </Suspense>
            </RequireWorkspace>
          }
        />
        <Route
          path="/pharmacy/*"
          element={
            <RequireWorkspace id="pharmacy">
              <Suspense fallback={<WorkspaceFallback />}>
                <PharmacyWorkspace />
              </Suspense>
            </RequireWorkspace>
          }
        />

        <Route path="*" element={<UnknownRoute />} />
      </Route>
    </Routes>
  </AuthProvider>
);

/** A signed-in user on a path no workspace claims — send them to their own home. */
const UnknownRoute = () => {
  const { user } = useAuth();
  return <Navigate to={user ? homePathForRole(user.role) : '/login'} replace />;
};

export default App;
