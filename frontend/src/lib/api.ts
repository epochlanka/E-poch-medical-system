import axios from 'axios';
import { toFriendlyError, type FriendlyError } from './errorMessage';
import { homePathForRole, isUserRole } from '../app/workspaces';

// Keep the API on the same computer that served the UI. This makes the default work both on
// localhost and when another clinic PC opens the app through this computer's LAN address.
export const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
});

// Broadcast so a single global listener can surface network / server errors as a toast,
// without every call site having to handle them.
export const APP_ERROR_EVENT = 'epoch:app-error';
const emitAppError = (friendly: FriendlyError) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<FriendlyError>(APP_ERROR_EVENT, { detail: friendly }));
  }
};

// Timer-driven refreshes (live queue boards, sidebar counters) send this so the server does not
// count them as human activity. Without it, a queue board left open on an unattended workstation
// polls every 10-15s, keeps the session "active", and the idle timeout can never fire.
export const BACKGROUND_REQUEST = { headers: { 'X-Epoch-Background': '1' } } as const;

// The role this tab last saw itself signed in as, kept current by AuthContext. One session cookie
// is shared by every tab on this origin, so signing in as someone else in another tab silently
// swaps the session under this one, which never re-fetches /auth/me on its own. This tab keeps
// showing the old role's UI until an action 403s. The interceptor below tells that apart from a
// genuine same-role permission error: it only redirects when the role actually changed underneath.
export const authState: { role: string | null } = { role: null };

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      // Session gone or expired. A full load (rather than a route change) clears anything the
      // previous session left in memory, and lands on the shared sign-in screen.
      window.location.replace(`/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return Promise.reject(error);
    }

    if (error.response?.status === 403 && !window.location.pathname.startsWith('/login')) {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/v1/auth/me`, { withCredentials: true });
        const actualRole = data?.user?.role;
        if (actualRole && actualRole !== authState.role && isUserRole(actualRole)) {
          window.location.replace(homePathForRole(actualRole));
          return new Promise(() => {}); // navigation is in flight; nothing else should run
        }
      } catch {
        // /auth/me failed too (e.g. fully logged out) — fall through to the normal error path.
      }
    }

    const friendly = toFriendlyError(error);
    // Attach normalized info so callers can use `err.friendly` / `err.errorId` directly,
    // while `err.response.data.message` keeps working for existing `.catch` handlers.
    error.friendly = friendly;
    error.errorId = friendly.errorId;
    error.friendlyMessage = friendly.message;

    // Only auto-toast the errors a user can't act on themselves.
    if (friendly.kind === 'network' || friendly.kind === 'server') {
      emitAppError(friendly);
    }

    return Promise.reject(error);
  }
);

export const fileUrl = (path: string) => `${API_BASE_URL}${path}`;
