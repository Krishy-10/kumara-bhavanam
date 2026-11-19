import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ToastMessage {
  text: string;
  action?: { label: string; onClick: () => void };
  tone?: 'ok' | 'error';
}

/** One short message at a time, announced to screen readers, gone after a few seconds. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((t: ToastMessage) => {
    window.clearTimeout(timer.current);
    setToast(t);
    timer.current = window.setTimeout(() => setToast(null), t.action ? 7000 : 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const hide = useCallback(() => setToast(null), []);
  return { toast, show, hide };
}

export function Toast({ toast, onHide }: { toast: ToastMessage | null; onHide: () => void }): ReactNode {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[104px] z-30 mx-auto flex max-w-app justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex min-h-touch w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-[15px] shadow-lg ${
              toast.tone === 'error' ? 'bg-terracotta text-white' : 'bg-teak text-white'
            }`}
          >
            <span>{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  onHide();
                }}
                className="min-h-touch shrink-0 px-2 font-semibold text-marigold underline-offset-4 hover:underline"
              >
                {toast.action.label}
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
