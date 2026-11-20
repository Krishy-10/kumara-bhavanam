/**
 * A full month, Monday first. Swipe left/right (or use the arrows) to change
 * month; tap the month name to jump straight to any month of any year.
 * Each night is a button; booked nights join into a bar per stay.
 * Meaning is never colour alone: each day has a full spoken label, and the
 * legend uses shapes too (bar, outline, stripes, ring).
 *
 * Used on Stays (tap a day to see what's on) and in New booking's date picker
 * (`range` marks the nights being picked).
 */
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { BlockedRow, StayRow } from '@/data/types';
import { addMonths, formatLongDay, formatMonthYear, monthKey, monthRange, weekdayMon0, type ISODate } from '@/lib/dates';
import { STATUS_LABEL, plural } from '@/lib/labels';
import { bookedNightsIn, calendarDay, monthGrid, type CalendarDay } from '@/lib/occupancy';
import { cx } from '@/lib/cx';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Nights being picked: check-in included, check-out excluded. */
export interface PickedRange {
  start: ISODate;
  end: ISODate;
}

export function MonthCalendar({
  month,
  direction,
  onMonth,
  onJump,
  stays,
  blocked,
  today,
  selected = null,
  range = null,
  onSelect,
  showLegend = true,
}: {
  month: string;
  /** +1 when moving forward, −1 back: decides the slide direction. */
  direction: number;
  onMonth: (step: 1 | -1) => void;
  /** Jump straight to a month ('YYYY-MM'). */
  onJump: (month: string) => void;
  stays: StayRow[];
  blocked: BlockedRow[];
  today: ISODate;
  selected?: ISODate | null;
  range?: PickedRange | null;
  onSelect: (d: ISODate) => void;
  showLegend?: boolean;
}) {
  const [jumping, setJumping] = useState(false);
  const days = useMemo(() => monthGrid(month).map((d) => calendarDay(d, stays, blocked)), [month, stays, blocked]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) onMonth(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) onMonth(-1);
  };

  return (
    <div className="rounded-card border border-line bg-white p-3 pb-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (jumping ? onJump(addMonths(month, -12)) : onMonth(-1))}
          aria-label={jumping ? 'Previous year' : 'Previous month'}
          className="grid h-12 w-12 place-items-center rounded-full hover:bg-haldi"
        >
          <Icon name="back" />
        </button>
        <button
          type="button"
          onClick={() => setJumping((j) => !j)}
          aria-expanded={jumping}
          aria-label={jumping ? `Close month list, ${formatMonthYear(month)}` : `${formatMonthYear(month)}. Jump to another month`}
          className="flex min-h-touch items-center gap-1.5 rounded-full px-3 hover:bg-haldi"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.span
              key={jumping ? month.slice(0, 4) : month}
              custom={direction}
              initial={{ opacity: 0, x: direction * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -30 }}
              className="num font-display text-[18px] font-semibold"
              aria-live="polite"
            >
              {jumping ? month.slice(0, 4) : formatMonthYear(month)}
            </motion.span>
          </AnimatePresence>
          <Icon name="chevron" size={18} className={cx('text-muted transition-transform', jumping ? '-rotate-90' : 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => (jumping ? onJump(addMonths(month, 12)) : onMonth(1))}
          aria-label={jumping ? 'Next year' : 'Next month'}
          className="grid h-12 w-12 place-items-center rounded-full hover:bg-haldi"
        >
          <Icon name="chevron" />
        </button>
      </div>

      {jumping ? (
        <MonthJump
          month={month}
          today={today}
          stays={stays}
          onPick={(m) => {
            setJumping(false);
            onJump(m);
          }}
        />
      ) : (
        <>
          <div className="mt-1 grid grid-cols-7 text-center text-[13px] font-semibold text-muted" aria-hidden="true">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              {/* The slide and the swipe sit on separate layers: a tap during the
                  slide starts a drag, and a drag stops its own element's
                  animation, which used to leave the month stuck half-way. */}
              <motion.div
                key={month}
                custom={direction}
                initial={{ opacity: 0, x: direction * 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -80 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  dragSnapToOrigin
                  onDragEnd={onDragEnd}
                  className="grid touch-pan-y grid-cols-7 gap-y-1"
                  role="group"
                  aria-label={`${formatMonthYear(month)}. Swipe to change month.`}
                >
                  {days.map((d) => (
                    <DayCell
                      key={d.date}
                      day={d}
                      inMonth={d.date.startsWith(month)}
                      today={today}
                      selected={selected === d.date}
                      picked={range ? pickedPart(d.date, range) : null}
                      onSelect={onSelect}
                    />
                  ))}
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}

      {showLegend && !jumping && (
        <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-2 text-[13px] text-muted" aria-label="Legend">
          <Legend swatch="h-3 w-5 rounded-full bg-peacock" label="Booked" />
          <Legend swatch="h-3 w-5 rounded-full border-2 border-dashed border-marigold bg-haldi" label="Tentative" />
          <Legend swatch="hatch h-3 w-5 rounded-full border border-line-strong" label="Blocked" />
          <Legend swatch="h-3.5 w-3.5 rounded-full ring-2 ring-marigold" label="Today" />
          <Legend swatch="h-3 w-5 rounded-full border border-line-strong bg-white" label="Free" />
        </ul>
      )}
    </div>
  );
}

/** 12 months of the shown year, each with how many nights are booked. */
function MonthJump({ month, today, stays, onPick }: { month: string; today: ISODate; stays: StayRow[]; onPick: (m: string) => void }) {
  const year = month.slice(0, 4);
  const thisMonth = monthKey(today);
  return (
    <div className="fade-in grid grid-cols-3 gap-2 px-1 pb-2 pt-2" role="group" aria-label={`Months of ${year}`}>
      {MONTHS_SHORT.map((name, i) => {
        const m = `${year}-${String(i + 1).padStart(2, '0')}`;
        const { start, end } = monthRange(m);
        const booked = bookedNightsIn(stays, start, end);
        const shown = m === month;
        const isNow = m === thisMonth;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onPick(m)}
            aria-pressed={shown}
            aria-label={`${formatMonthYear(m)}${isNow ? ', this month' : ''}, ${plural(booked, 'night')} booked`}
            className={cx(
              'flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl border text-center transition-colors',
              shown ? 'border-teak bg-teak text-white' : isNow ? 'border-marigold bg-haldi' : 'border-line hover:bg-haldi',
              !shown && m < thisMonth && 'text-muted',
            )}
          >
            <span className="font-display text-[17px] font-semibold">{name}</span>
            <span className={cx('num text-[12px]', shown ? 'text-white/80' : 'text-muted')}>{booked > 0 ? `${booked} booked` : isNow ? 'This month' : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={swatch} aria-hidden="true" />
      {label}
    </li>
  );
}

type Picked = 'start' | 'night' | 'end';

/** Where a date sits in the nights being picked; the check-out day is 'end'. */
function pickedPart(date: ISODate, r: PickedRange): Picked | null {
  if (date === r.start) return 'start';
  if (date === r.end) return 'end';
  if (date > r.start && date < r.end) return 'night';
  return null;
}

function DayCell({
  day,
  inMonth,
  today,
  selected,
  picked,
  onSelect,
}: {
  day: CalendarDay<StayRow, BlockedRow>;
  inMonth: boolean;
  today: ISODate;
  selected: boolean;
  picked: Picked | null;
  onSelect: (d: ISODate) => void;
}) {
  const col = weekdayMon0(day.date);
  const shown = day.stay ?? day.tentative;
  const isToday = day.date === today;
  const past = day.date < today;
  // Bars run across the week; they round off at a stay's ends and at week edges.
  const roundL = day.isStart || col === 0;
  const roundR = day.isEnd || col === 6;

  const label = [
    formatLongDay(day.date),
    isToday ? 'today' : null,
    picked === 'start' ? 'check-in' : picked === 'end' ? 'check-out' : picked === 'night' ? 'picked night' : null,
    day.stay ? `${day.stay.guest_name}, ${STATUS_LABEL[day.stay.status]}` : null,
    day.tentative ? `${day.tentative.guest_name}, tentative` : null,
    day.blocked ? `blocked, ${day.blocked.reason}` : null,
    !shown && !day.blocked ? 'free' : null,
  ]
    .filter(Boolean)
    .join('. ');

  const end = selected || picked === 'start' || picked === 'end';

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected || picked !== null}
      onClick={() => onSelect(day.date)}
      className={cx('relative flex h-11 items-center justify-center focus-visible:z-10', !inMonth && 'opacity-35')}
    >
      {shown && (
        <span
          aria-hidden="true"
          className={cx(
            'absolute inset-y-1',
            roundL ? 'left-1 rounded-l-full' : '-left-px',
            roundR ? 'right-1 rounded-r-full' : '-right-px',
            day.stay
              ? day.stay.status === 'completed'
                ? 'bg-peacock/55'
                : 'bg-peacock'
              : 'border-y-2 border-dashed border-marigold bg-haldi',
            !day.stay && roundL && 'border-l-2',
            !day.stay && roundR && 'border-r-2',
          )}
        />
      )}
      {day.blocked && !shown && <span aria-hidden="true" className="hatch absolute inset-1 rounded-xl border border-line-strong" />}
      <span
        className={cx(
          'num relative grid h-8 w-8 place-items-center rounded-full text-[15px]',
          day.stay ? 'font-semibold text-white' : past && !shown ? 'text-muted' : 'text-teak',
          isToday && 'ring-2 ring-marigold',
          picked === 'night' && 'font-bold ring-2 ring-teak',
          picked === 'night' && day.stay && 'ring-white',
          end && 'bg-teak font-bold text-white ring-2 ring-white',
        )}
      >
        {Number(day.date.slice(8))}
      </span>
    </button>
  );
}
