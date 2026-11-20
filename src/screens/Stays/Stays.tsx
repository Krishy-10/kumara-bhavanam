/** Stays: a swipeable month calendar, what's on a tapped day, and the stay lists. */
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton } from '@/components/Layout';
import { StatusPill } from '@/components/StatusPill';
import { StayItem } from '@/components/StayItem';
import { Toast, useToast } from '@/components/Toast';
import { useBlockedDates, useRemoveBlocked, useStays } from '@/data/hooks';
import type { BlockedRow, StayRow } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { addMonths, formatLongDay, formatMonthYear, formatRange, monthKey, monthRange, nightsBetween, type ISODate } from '@/lib/dates';
import { bookedNightsIn, calendarDay, currentStay } from '@/lib/occupancy';
import { PipelineLink } from '@/screens/Pipeline/Pipeline';
import { BlockSheet } from './BlockSheet';
import { MonthCalendar } from '@/components/MonthCalendar';

type ListTab = 'upcoming' | 'past' | 'cancelled';
const PAGE = 12;

export function Stays() {
  const today = useToday();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : monthKey(today);
  const [direction, setDirection] = useState(1);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [tab, setTab] = useState<ListTab>('upcoming');
  const [shown, setShown] = useState(PAGE);
  const [blocking, setBlocking] = useState(false);
  const { toast, show, hide } = useToast();

  const stays = useStays();
  const blocked = useBlockedDates();
  const removeBlocked = useRemoveBlocked();

  const changeMonth = (step: 1 | -1) => {
    setDirection(step);
    setSelected(null);
    setParams({ month: addMonths(month, step) }, { replace: true });
  };

  const lists = useMemo(() => {
    const all = stays.data ?? [];
    const now = currentStay(all, today);
    const upcoming = all
      .filter((s) => s !== now && s.status !== 'cancelled' && s.status !== 'completed' && s.check_out > today)
      .sort((a, b) => (a.check_in < b.check_in ? -1 : 1));
    const past = all.filter((s) => s !== now && s.status !== 'cancelled' && !upcoming.includes(s)).sort((a, b) => (a.check_in < b.check_in ? 1 : -1));
    const cancelled = all.filter((s) => s.status === 'cancelled').sort((a, b) => (a.check_in < b.check_in ? 1 : -1));
    return { now, upcoming, past, cancelled };
  }, [stays.data, today]);

  const futureBlocks = (blocked.data ?? []).filter((b) => b.end_date >= today);
  const { start, end } = monthRange(month);
  const monthNights = nightsBetween(start, end);
  const booked = bookedNightsIn(stays.data ?? [], start, end);

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3 px-[22px] pt-1">
        <h1 className="text-[26px] font-bold tracking-tight">Stays</h1>
        <Button variant="outline" icon={<Icon name="block" size={20} />} onClick={() => setBlocking(true)}>
          Block dates
        </Button>
      </header>

      {stays.error || blocked.error ? (
        <div className="mt-4">
          <ErrorState message={(stays.error ?? blocked.error)!.message} onRetry={() => void Promise.all([stays.refetch(), blocked.refetch()])} />
        </div>
      ) : !stays.data || !blocked.data ? (
        <div className="mt-4 flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[380px]" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <>
          <div className="mt-3 px-4">
            <MonthCalendar
              month={month}
              direction={direction}
              onMonth={changeMonth}
              onJump={(m) => {
                if (m === month) return;
                setDirection(m > month ? 1 : -1);
                setSelected(null);
                setParams(m === monthKey(today) ? {} : { month: m }, { replace: true });
              }}
              stays={stays.data}
              blocked={blocked.data}
              today={today}
              selected={selected}
              onSelect={(d) => setSelected((cur) => (cur === d ? null : d))}
            />
            <p className="mt-2 px-1 text-[14px] text-muted">
              {formatMonthYear(month)}: <span className="num font-semibold text-teak">{booked}</span> of {monthNights} nights booked
              {month !== monthKey(today) && (
                <button
                  type="button"
                  onClick={() => {
                    setDirection(month > monthKey(today) ? -1 : 1);
                    setParams({}, { replace: true });
                  }}
                  className="ml-2 min-h-touch font-semibold text-peacock underline underline-offset-4"
                >
                  Back to this month
                </button>
              )}
            </p>
          </div>

          <AnimatePresence initial={false}>
            {selected && (
              <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 px-4">
                <DayPanel
                  date={selected}
                  today={today}
                  stays={stays.data}
                  blocked={blocked.data}
                  onBook={() => navigate('/book', { state: { checkIn: selected } })}
                  onBlock={() => setBlocking(true)}
                  onUnblock={(b) => removeBlocked.mutate(b.id, { onSuccess: () => show({ text: 'Dates unblocked' }) })}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {lists.now && (
            <section className="mt-5 px-4" aria-labelledby="now-h">
              <h2 id="now-h" className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                Now
              </h2>
              <StayItem stay={lists.now} highlight year={today.slice(0, 4)} />
            </section>
          )}

          <section className="mt-5 px-4" aria-label="Stay lists">
            <PipelineLink stays={stays.data} className="mb-3" />
            <Segmented<ListTab>
              label="Which stays"
              name="stay-tab"
              value={tab}
              onChange={(t) => {
                setTab(t);
                setShown(PAGE);
              }}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <ul className="mt-3 flex flex-col gap-2.5">
              {lists[tab].slice(0, shown).map((s, i) => (
                <motion.li key={s.stay_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                  <StayItem stay={s} year={today.slice(0, 4)} />
                </motion.li>
              ))}
            </ul>
            {lists[tab].length === 0 && (
              <p className="mt-3 rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">
                {tab === 'upcoming' ? 'Nothing booked ahead yet.' : tab === 'past' ? 'No past stays yet.' : 'No cancelled bookings.'}
              </p>
            )}
            {lists[tab].length > shown && (
              <Button variant="ghost" block className="mt-2" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({lists[tab].length - shown} left)
              </Button>
            )}
          </section>

          {tab === 'upcoming' && futureBlocks.length > 0 && (
            <section className="mt-5 px-4" aria-labelledby="blocked-h">
              <h2 id="blocked-h" className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
                Blocked dates
              </h2>
              <ul className="flex flex-col gap-2">
                {futureBlocks.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white py-1 pl-4 pr-1">
                    <span className="hatch h-8 w-8 shrink-0 rounded-lg border border-line-strong" aria-hidden="true" />
                    <span className="flex flex-1 flex-col">
                      <span className="text-[15px] font-semibold">{b.reason}</span>
                      <span className="text-[14px] text-muted">{blockLabel(b)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBlocked.mutate(b.id, { onSuccess: () => show({ text: 'Dates unblocked' }) })}
                      className="min-h-touch px-3 text-[14px] font-semibold text-muted underline underline-offset-4"
                      aria-label={`Unblock ${b.reason}, ${blockLabel(b)}`}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="h-4" />
        </>
      )}

      <BlockSheet open={blocking} onClose={() => setBlocking(false)} from={selected && selected >= today ? selected : today} stays={stays.data ?? []} onSaved={(text) => show({ text })} />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function blockLabel(b: BlockedRow): string {
  return b.start_date === b.end_date ? formatLongDay(b.start_date) : `${formatRange(b.start_date, b.end_date)} (both included)`;
}

function DayPanel({
  date,
  today,
  stays,
  blocked,
  onBook,
  onBlock,
  onUnblock,
}: {
  date: ISODate;
  today: ISODate;
  stays: StayRow[];
  blocked: BlockedRow[];
  onBook: () => void;
  onBlock: () => void;
  onUnblock: (b: BlockedRow) => void;
}) {
  const d = calendarDay(date, stays, blocked);
  const on = d.stay ?? d.tentative;
  return (
    <div className="rounded-card border border-line bg-white p-4" aria-live="polite">
      <p className="text-[14px] font-semibold text-muted">{formatLongDay(date)}</p>
      {on && (
        <Link to={`/stays/${on.stay_id}`} className="mt-1 flex min-h-touch items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[17px] font-semibold">{on.guest_name}</span>
            <span className="text-[14px] text-muted">{formatRange(on.check_in, on.check_out)}</span>
          </span>
          <span className="flex items-center gap-1">
            <StatusPill status={on.status} />
            <Icon name="chevron" size={20} className="text-muted" />
          </span>
        </Link>
      )}
      {d.blocked && (
        <div className="mt-1 flex min-h-touch items-center justify-between gap-3">
          <span className="text-[15px]">
            Blocked: <strong className="font-semibold">{d.blocked.reason}</strong>
          </span>
          <button type="button" onClick={() => onUnblock(d.blocked!)} className="min-h-touch px-2 text-[14px] font-semibold text-muted underline underline-offset-4">
            Unblock
          </button>
        </div>
      )}
      {!d.stay && date >= today && (
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" icon={<Icon name="plus" size={20} />} onClick={onBook}>
            {d.tentative ? 'Book anyway' : 'Book from here'}
          </Button>
          {!d.blocked && (
            <Button variant="outline" onClick={onBlock}>
              Block
            </Button>
          )}
        </div>
      )}
      {!on && !d.blocked && date < today && <p className="mt-1 text-[15px] text-muted">Nobody stayed this night.</p>}
    </div>
  );
}
