import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, authState } from '../lib/api';
import { clearAllDrafts, setDraftOwner } from '../lib/drafts';
import type { UserRole } from '../app/workspaces';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * The single auth context for every workspace. Each portal used to carry its own copy of this,
 * with its own localStorage key names — which only worked because the portals sat on different
 * ports. One origin means one session, held in the backend's httpOnly cookie and mirrored here.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the api layer's view of "who this tab thinks it is" current, so its 403 handler can
  // tell a session swapped in another tab (see lib/api.ts) apart from a genuine permission error.
  useEffect(() => {
    authState.role = user?.role ?? null;
  }, [user]);

  useEffect(() => {
    let active = true;
    // Tokens were briefly mirrored into localStorage, per portal. Nothing reads them any more, so
    // clear whatever an older build of any portal left behind on this workstation.
    for (const key of ['epoch_token', 'epoch_user', 'epoch_doctor_token', 'epoch_doctor_user',
      'epoch_reception_token', 'epoch_reception_user', 'epoch_pharmacist_token', 'epoch_pharmacist_user']) {
      try { localStorage.removeItem(key); } catch { /* storage can be unavailable */ }
    }

    api.get<{ user: AuthUser }>('/auth/me')
      .then(({ data }) => { if (!active) return; setDraftOwner(data.user.id); setUser(data.user); })
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, []);

  const login = (nextUser: AuthUser) => { setDraftOwner(nextUser.id); setUser(nextUser); };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAllDrafts();
      setUser(null);
      // A full document load rather than a route change: on a shared workstation this guarantees
      // nothing the previous user loaded is still held in a component, a cache or a closure.
      window.location.replace('/login');
    }
  };

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, loading, login, logout }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
