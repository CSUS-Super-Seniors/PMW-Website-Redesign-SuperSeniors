import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const openModalStack: symbol[] = [];
let previousBodyOverflow: string | null = null;

export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const modalId = useRef(Symbol());

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
    const firstFocusable = focusableElements?.[0];

    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialogRef.current?.focus();
    }

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const currentModalId = modalId.current;

    if (openModalStack.length === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    openModalStack.push(currentModalId);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openModalStack[openModalStack.length - 1] !== currentModalId) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const elements = dialog.querySelectorAll<HTMLElement>(focusableSelector);
      const focusable = Array.from(elements);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutside = !dialog.contains(document.activeElement);

      if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      const stackIndex = openModalStack.indexOf(currentModalId);

      if (stackIndex !== -1) {
        openModalStack.splice(stackIndex, 1);
      }

      if (openModalStack.length === 0 && previousBodyOverflow !== null) {
        document.body.style.overflow = previousBodyOverflow;
        previousBodyOverflow = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-scrim p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          'relative w-full max-w-lg rounded-lg bg-white p-6 shadow-overlay',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="type-h3 text-dark-brown">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => onCloseRef.current()}
            className="type-body flex min-h-11 min-w-11 items-center justify-center rounded-sm text-dark-brown hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
