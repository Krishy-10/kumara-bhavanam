/**
 * Bottom sheet dialog: slides up, dims the page, closes on Escape, on the
 * backdrop or the close button, keeps focus inside while open and hands it
 * back to whatever opened it.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sticks to the bottom of the sheet (the main action). */
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Parents usually pass a fresh arrow each render; read it through a ref so
  // the open/close effect runs only when `open` changes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field (or the close button) once the panel is in.
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input, textarea, [data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus({ preventScroll: true });
    }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-teak/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="relative flex max-h-[92dvh] w-full max-w-app flex-col rounded-t-hero bg-jasmine shadow-[0_-20px_50px_-20px_rgba(43,29,20,0.5)]"
          >
            <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-line-strong" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-2">
              <h2 id={titleId} className="text-[20px] font-bold">
                {title}
              </h2>
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-12 w-12 place-items-center rounded-full text-muted hover:bg-line/60">
                <Icon name="close" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
            {footer && <div className="border-t border-line bg-jasmine px-5 pb-safe pt-3 [&>*]:mb-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
