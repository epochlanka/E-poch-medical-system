import axios from 'axios';

// Turns anything a failed request/render throws into something safe to show a user.
// The backend's standard error body is: { success: false, message: string, errorId?: string }

export interface FriendlyError {
  message: string;
  errorId: string | null;
  status: number | null;
  kind: 'network' | 'server' | 'client' | 'unknown';
}

const GENERIC = 'Something went wrong. Please try again.';
const OFFLINE = 'Unable to reach the server. Check your connection and try again.';

export const toFriendlyError = (error: unknown): FriendlyError => {
  if (axios.isAxiosError(error)) {
    // No response at all -> network / CORS / server down / timeout.
    if (!error.response) {
      return { message: OFFLINE, errorId: null, status: null, kind: 'network' };
    }

    const status = error.response.status;
    const data = error.response.data as { message?: string; error?: string; errorId?: string } | undefined;
    const errorId = data?.errorId ?? null;

    if (status >= 500) {
      return {
        message: data?.message || GENERIC,
        errorId,
        status,
        kind: 'server',
      };
    }

    // 4xx — the server's message is user-appropriate (validation, not found, forbidden…).
    return {
      message: data?.message || data?.error || 'The request could not be completed.',
      errorId,
      status,
      kind: 'client',
    };
  }

  if (error instanceof Error && error.message) {
    return { message: GENERIC, errorId: null, status: null, kind: 'unknown' };
  }

  return { message: GENERIC, errorId: null, status: null, kind: 'unknown' };
};

/** A short client-side reference for a render crash (no server Error ID exists in that case). */
export const clientErrorRef = (): string => {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `UI-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rand}`;
};
