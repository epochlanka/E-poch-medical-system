import axios from 'axios';
import { toFriendlyError, type FriendlyError } from './errorMessage';
import { commonLoginUrl } from '../config/roleRoutes';

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

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.replace(commonLoginUrl());
      return Promise.reject(error);
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
