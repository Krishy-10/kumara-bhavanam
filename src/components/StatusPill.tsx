import type { StayStatus } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/labels';
import { cx } from '@/lib/cx';

/** Colour plus words, never colour alone. */
export const STATUS_TONE: Record<StayStatus, string> = {
  enquiry: 'border border-line-strong bg-white text-muted',
  tentative: 'border border-marigold bg-haldi text-teak',
  confirmed: 'bg-peacock/10 text-peacock',
  checked_in: 'bg-peacock text-white',
  completed: 'bg-leaf/20 text-peacock-dark',
  cancelled: 'bg-terracotta-50 text-terracotta line-through decoration-1',
};

export function StatusPill({ status, className }: { status: StayStatus; className?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold', STATUS_TONE[status], className)}>{STATUS_LABEL[status]}</span>;
}
