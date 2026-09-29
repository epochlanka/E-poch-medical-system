import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './feedback.css';

/*
 * One place for "something happened" and "are you sure?" across both front desk halves.
 *
 * Before this, results were written into a banner at the top of the page — which is why the
 * dispensing screen had to scroll the window to the top every time it set an error — and
 * confirmations used window.confirm(), an OS dialog that looks nothing like the app and stops
 * everything at a service counter. Toasts appear in a fixed region that is already in view, and
 * confirmations are a native <dialog>, so they keep the focus trap and Escape handling.
 *
 * Both apps mount their own provider. Inside the combined front desk portal the pharmacy pages
 * resolve to this same module, so they pick up the portal's provider.
 */

export type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys work or money; styles the confirm button accordingly. */
  tone?: 'default' | 'danger';
}

interface FeedbackApi {
  toast: (message: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const TOAST_MS = 6000;

export const useFeedback = (): FeedbackApi => {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return api;
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, message, tone }]);
      timers.current.push(window.setTimeout(() => dismiss(id), TOAST_MS));
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    if (ask) dialogRef.current?.showModal();
  }, [ask]);

  const settle = (ok: boolean) => {
    ask?.resolve(ok);
    dialogRef.current?.close();
    setAsk(null);
  };

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Polite so a toast never interrupts someone mid-sentence with a patient. */}
      <div className="fb-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className={`fb-toast ${t.tone}`} key={t.id}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="fb-confirm"
        aria-labelledby="fb-confirm-title"
        onCancel={(event) => {
          event.preventDefault();
          settle(false);
        }}
      >
        {ask && (
          <>
            <h2 id="fb-confirm-title">{ask.title}</h2>
            {ask.body && <p>{ask.body}</p>}
            <div className="fb-confirm-actions">
              <button type="button" className="fb-btn" onClick={() => settle(false)}>
                {ask.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`fb-btn primary${ask.tone === 'danger' ? ' danger' : ''}`}
                autoFocus
                onClick={() => settle(true)}
              >
                {ask.confirmLabel ?? 'Continue'}
              </button>
            </div>
          </>
        )}
      </dialog>
    </FeedbackContext.Provider>
  );
}
