import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { commonLoginUrl, redirectToRoleHome, type UserRole } from '../config/roleRoutes';

export const CommonLoginRedirect = () => {
  useEffect(() => window.location.replace(commonLoginUrl()), []);
  return null;
};

export const RoleRedirect = ({ role }: { role: UserRole }) => {
  useEffect(() => redirectToRoleHome(role), [role]);
  return null;
};

const ProtectedRoute = ({ children, requiredRole }: { children: ReactNode; requiredRole: UserRole }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user && user.role !== requiredRole) return <RoleRedirect role={user.role} />;
  return <>{children}</>;
};

export default ProtectedRoute;
