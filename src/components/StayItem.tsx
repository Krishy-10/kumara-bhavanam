import { Link } from 'react-router';
import type { StayRow } from '@/data/types';
import { formatRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { plural } from '@/lib/labels';
import { DUE_NOW_STATUSES } from '@/lib/money';
import { cx } from '@/lib/cx';
import { StatusPill } from './StatusPill';

/** One stay in a list: guest, dates, size, and either the money due or the status. */
export function StayItem({ stay, highlight, year }: { stay: StayRow; highlight?: boolean; year: string }) {
  const due = DUE_NOW_STATUSES.includes(stay.status) && stay.balance > 0;
  return (
    <Link
      to={`/stays/${stay.stay_id}`}
      className={cx(
        'flex min-h-[68px] items-center gap-3 rounded-card border px-4 py-3 transition-transform active:scale-[0.99]',
        highlight ? 'border-peacock/25 bg-peacock/5' : 'border-line bg-white',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-semibold">{stay.guest_name}</span>
        <span className="text-[14px] text-muted">
          {formatRange(stay.check_in, stay.check_out)}
          {stay.check_in.slice(0, 4) !== year && ` ${stay.check_in.slice(0, 4)}`} ·{' '}
          {plural(stay.guests_count, 'guest')}
          {stay.driver_room && ' + driver'}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {due ? <span className="num text-[15px] font-semibold text-terracotta">{formatRupees(stay.balance)} due</span> : <StatusPill status={stay.status} />}
        <span className="num text-[13px] text-muted">{stay.bill_no}</span>
      </span>
    </Link>
  );
}
