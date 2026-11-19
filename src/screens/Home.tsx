import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton } from '@/components/Layout';
import { firstName } from '@/config/users';
import { useBlockedDates, useMonthPayments, useStays } from '@/data/hooks';
import type { StayRow } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { formatDayMonth, formatLongDay, formatShortDay, monthKey, monthRange, nightsBetween } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { STATUS_LABEL, plural } from '@/lib/labels';
import { collectedBetween, DUE_NOW_STATUSES, toCollect } from '@/lib/money';
import { currentStay, nextArrival, nextFreeWindow, nightProgress, occupiedRanges } from '@/lib/occupancy';

const rise = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 + i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
});

export function Home() {
  const today = useToday();
  const month = monthKey(today);
  const stays = useStays();
  const payments = useMonthPayments(month);
  const blocked = useBlockedDates();
  const navigate = useNavigate();

  const loading = stays.isPending || payments.isPending || blocked.isPending;
  const error = stays.error ?? payments.error ?? blocked.error;

  return (
    <Screen>
      <header className="flex flex-col gap-0.5 px-[22px] pt-1">
        <span className="text-[15px] text-muted">வணக்கம் · {formatLongDay(today)}</span>
        <h1 className="text-[26px] font-bold tracking-tight">Kumara Bhavanam</h1>
      </header>

      {error ? (
        <div className="mt-5">
          <ErrorState
            message={error.message}
            onRetry={() => {
              void stays.refetch();
              void payments.refetch();
              void blocked.refetch();
            }}
          />
        </div>
      ) : loading || !stays.data || !payments.data || !blocked.data ? (
        <div className="mt-5 flex flex-col gap-3.5 px-[18px]" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[188px] rounded-hero" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
          </div>
          <Skeleton className="h-[88px]" />
        </div>
      ) : (
        <HomeBody
          today={today}
          month={month}
          stays={stays.data}
          payments={payments.data}
          blocked={blocked.data}
        />
      )}

      <motion.div {...rise(5)} className="mt-auto px-[18px] pb-3 pt-5">
        <Button size="lg" block icon={<Icon name="plus" size={22} strokeWidth={2.4} />} onClick={() => navigate('/book')}>
          New booking
        </Button>
      </motion.div>
    </Screen>
  );
}

function HomeBody({
  today,
  month,
  stays,
  payments,
  blocked,
}: {
  today: string;
  month: string;
  stays: StayRow[];
  payments: Parameters<typeof collectedBetween>[0];
  blocked: Parameters<typeof occupiedRanges>[1];
}) {
  const now = currentStay(stays, today);
  const next = nextArrival(stays, today, now);
  const free = nextFreeWindow(occupiedRanges(stays, blocked), today);
  const { start, end } = monthRange(month);
  const collected = collectedBetween(payments, start, end);
  const owed = toCollect(stays);
  const owing = stays.filter((s) => DUE_NOW_STATUSES.includes(s.status) && s.balance > 0);
  const monthShort = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(`${start}T00:00:00Z`));

  return (
    <div className="mt-5 flex flex-col gap-3.5">
      <motion.div {...rise(0)} className="px-[18px]">
        {now ? <NowStayingCard stay={now} today={today} /> : <FloorFreeCard from={free.from} until={free.until} today={today} />}
      </motion.div>

      <motion.div {...rise(1)} className="grid grid-cols-2 gap-3 px-[18px]">
        <div className="flex flex-col gap-1 rounded-card border border-line bg-white p-4">
          <span className="text-[13px] text-muted">Collected in {monthShort}</span>
          <span className="num text-[26px] font-bold leading-tight">{formatRupees(collected.amount)}</span>
          <span className="text-[13px] text-peacock">{plural(collected.count, 'payment')}</span>
        </div>
        <div
          className={
            owed > 0
              ? 'flex flex-col gap-1 rounded-card border border-terracotta-100 bg-terracotta-50 p-4'
              : 'flex flex-col gap-1 rounded-card border border-line bg-white p-4'
          }
        >
          <span className="text-[13px] text-muted">To collect</span>
          <span className={`num text-[26px] font-bold leading-tight ${owed > 0 ? 'text-terracotta' : ''}`}>{formatRupees(owed)}</span>
          <span className={`text-[13px] ${owed > 0 ? 'text-terracotta' : 'text-peacock'}`}>
            {owing.length === 0
              ? 'All settled'
              : owing.length === 1
                ? `${firstName(owing[0]!.guest_name)} · ${owing[0]!.status === 'checked_in' ? 'at check-out' : 'after check-out'}`
                : plural(owing.length, 'stay')}
          </span>
        </div>
      </motion.div>

      {next && (
        <motion.div {...rise(2)} className="px-[18px]">
          <Link
            to={`/stays/${next.stay_id}`}
            className="flex items-center gap-3.5 rounded-card bg-haldi px-[18px] py-4 transition-transform active:scale-[0.99]"
          >
            <div className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl bg-marigold">
              <span className="text-[11px] font-semibold tracking-wider">
                {formatDayMonth(next.check_in).split(' ')[1]?.toUpperCase()}
              </span>
              <span className="num text-[22px] font-bold leading-none">{Number(next.check_in.slice(8))}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] text-muted">
                {next.check_in === today ? 'Arriving today' : `Next arrival · ${formatShortDay(next.check_in).split(',')[0]}`}
                {next.status === 'tentative' && <span className="ml-1.5 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold">Tentative</span>}
              </span>
              <span className="truncate text-[17px] font-semibold">{next.guest_name}</span>
              <span className="text-[14px] text-muted">
                {plural(next.guests_count, 'guest')} · {plural(next.nights, 'night')} ·{' '}
                {next.balance > 0 ? `${formatRupees(next.balance)} due` : 'Paid'}
              </span>
            </div>
            <Icon name="chevron" size={20} className="text-muted" />
          </Link>
        </motion.div>
      )}

      {now && (
        <motion.p {...rise(3)} className="flex items-center gap-2 px-[22px] text-[14px] text-muted">
          <span className="h-2 w-2 rounded-full bg-leaf" aria-hidden="true" />
          {free.until
            ? `Floor is free ${formatRangeShort(free.from, free.until)}`
            : `Floor is free from ${formatDayMonth(free.from)}`}
        </motion.p>
      )}
    </div>
  );
}

/** "22 to 24 Nov" (the second date is the next check-in, so it's not a free night). */
function formatRangeShort(from: string, until: string): string {
  return from.slice(0, 7) === until.slice(0, 7)
    ? `${Number(from.slice(8))} to ${formatDayMonth(until)}`
    : `${formatDayMonth(from)} to ${formatDayMonth(until)}`;
}

function NowStayingCard({ stay, today }: { stay: StayRow; today: string }) {
  const { total, tonight } = nightProgress(stay.check_in, stay.check_out, today);
  const details = [plural(stay.guests_count, 'guest'), stay.driver_room ? 'driver room' : null, stay.occasion].filter(Boolean).join(' · ');
  return (
    <Link
      to={`/stays/${stay.stay_id}`}
      className="kolam flex flex-col gap-3.5 rounded-hero bg-peacock p-[22px] text-white shadow-[0_18px_40px_-24px_rgba(15,94,90,0.9)] transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-marigold-glow">The floor · Now staying</span>
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[13px]">{STATUS_LABEL[stay.status]}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-[28px] font-semibold leading-[1.1]">{stay.guest_name}</span>
        <span className="text-[15px] text-peacock-mist">{details}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="img" aria-label={`Night ${tonight} of ${total}`}>
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            return n === tonight ? (
              <motion.span
                key={n}
                initial={{ scale: 0 }}
                animate={{ scale: 1, boxShadow: ['0 0 0 3px rgba(242,169,59,0.45)', '0 0 0 6px rgba(242,169,59,0.15)', '0 0 0 3px rgba(242,169,59,0.45)'] }}
                transition={{ scale: { delay: 0.2 + i * 0.04 }, boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
                className="block h-3.5 w-3.5 rounded-full bg-white"
              />
            ) : (
              <motion.span
                key={n}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 + i * 0.04, type: 'spring', stiffness: 500, damping: 25 }}
                className={`block h-2.5 w-2.5 rounded-full ${n < tonight ? 'bg-marigold' : 'bg-white/25'}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[14px] text-peacock-mist">
          <span>
            Night {tonight} of {total}
          </span>
          <span>Leaves {formatShortDay(stay.check_out)}</span>
        </div>
      </div>
    </Link>
  );
}

function FloorFreeCard({ from, until, today }: { from: string; until: string | null; today: string }) {
  const freeTonight = from === today;
  return (
    <div className="kolam flex flex-col gap-2 rounded-hero bg-peacock p-[22px] text-white">
      <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-marigold-glow">The floor</span>
      <span className="font-display text-[28px] font-semibold leading-[1.1]">{freeTonight ? 'Free tonight' : `Free from ${formatDayMonth(from)}`}</span>
      <span className="text-[15px] text-peacock-mist">
        {until ? `Next booked from ${formatShortDay(until)} · ${plural(nightsBetween(from, until), 'free night')}` : 'Nothing booked after this yet'}
      </span>
    </div>
  );
}
