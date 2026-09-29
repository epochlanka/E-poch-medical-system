import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFeedback } from '../../../shared/ui/feedback';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Matches the inline max-width the hand-rolled modals used to set on `.modal-card`. */
  maxWidth?: number;
  /** Accessible name; falls back to the `.modal-title` inside the card. */
  label?: string;
  /**
   * Whether closing would throw away typed input. Left undefined, the modal works it out by
   * watching its own fields, which is what every data-entry screen here wants.
   */
  dirty?: boolean;
}

const DISCARD_PROMPT = {
  title: 'Discard what you have entered?',
  body: 'Nothing has been saved yet.',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
  tone: 'danger' as const,
};

/**
 * A modal built on the native <dialog>, so it gets a focus trap, Escape-to-close, an inert
 * background and focus restored to whatever opened it — none of which the previous
 * `.modal-backdrop` <div> provided. Dismissing a form that has been typed into asks first;
 * a stray backdrop click used to silently discard the lot.
 */
const Modal = ({ onClose, children, maxWidth, label, dirty }: ModalProps) => {
  const { confirm } = useFeedback();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState(false);
  const hasInput = dirty ?? touched;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Any edit to a field inside the card counts as work in progress, so the discard guard does not
  // have to be wired up modal by modal.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || dirty !== undefined) return;
    const onEdit = () => setTouched(true);
    card.addEventListener('input', onEdit);
    card.addEventListener('change', onEdit);
    return () => {
      card.removeEventListener('input', onEdit);
      card.removeEventListener('change', onEdit);
    };
  }, [dirty]);

  const requestClose = useCallback(async () => {
    if (hasInput && !(await confirm(DISCARD_PROMPT))) return;
    onClose();
  }, [hasInput, onClose, confirm]);

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-label={label}
      onCancel={(event) => {
        // Escape: handled here so the guard runs and the parent stays the single source of truth
        // for whether the modal is mounted.
        event.preventDefault();
        void requestClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) void requestClose();
      }}
    >
      <div className="modal-card" ref={cardRef} style={maxWidth ? { maxWidth } : undefined}>
        {children}
      </div>
    </dialog>
  );
};

export default Modal;
