import { useEffect, useState, useCallback } from 'react';
import { APP_ERROR_EVENT } from '../lib/api';
import type { FriendlyError } from '../lib/errorMessage';

// A single app-wide listener that shows network / server errors as a dismissible toast, so
// individual pages don't each have to handle "the server is down". Render-time crashes are
// handled by <ErrorBoundary> instead.

interface Toast extends FriendlyError {
  id: number;
}

let seq = 0;

export default function GlobalErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((friendly: FriendlyError) => {
    setToasts((cur) => {
      // collapse an identical message that's already showing
      if (cur.some((t) => t.message === friendly.message && t.errorId === friendly.errorId)) return cur;
      const toast: Toast = { ...friendly, id: ++seq };
      const next = [...cur, toast].slice(-3);
      setTimeout(() => setToasts((c) => c.filter((t) => t.id !== toast.id)), 9000);
      return next;
    });
  }, []);

  useEffect(() => {
    const onAppError = (e: Event) => push((e as CustomEvent<FriendlyError>).detail);
    const onRejection = (e: PromiseRejectionEvent) => {
      // axios errors are already toasted via APP_ERROR_EVENT; only surface genuinely unhandled ones
      if (e.reason && (e.reason.friendly || e.reason.isAxiosError)) return;
      // eslint-disable-next-line no-console
      console.error('[E-POCH unhandled rejection]', e.reason);
      push({ message: 'Something went wrong. Please try again.', errorId: null, status: null, kind: 'unknown' });
    };
    window.addEventListener(APP_ERROR_EVENT, onAppError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener(APP_ERROR_EVENT, onAppError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          style={{
            background: 'var(--surface-color, #fff)',
            borderLeft: '4px solid var(--error, #E74C3C)',
            borderRadius: 'var(--radius-sm, 6px)',
            boxShadow: 'var(--shadow-lg, 0 16px 32px rgba(0,0,0,0.15))',
            padding: '12px 14px',
            fontSize: 13.5,
            color: 'var(--text-main, #2C3E50)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <strong>Something went wrong.</strong>
              <div style={{ marginTop: 2 }}>{t.message}</div>
              {t.errorId && (
                <div style={{ marginTop: 6, color: 'var(--text-muted, #7F8C8D)', fontSize: 12 }}>
                  Error ID: <code>{t.errorId}</code>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((c) => c.filter((x) => x.id !== t.id))}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: 'var(--text-muted, #7F8C8D)' }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
