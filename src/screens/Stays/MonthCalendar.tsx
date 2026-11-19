/**
 * A full month, Monday first. Swipe left/right (or use the arrows) to change
 * month. Each night is a button; booked nights join into a bar per stay.
 * Meaning is never colour alone: each day has a full spoken label, and the
 * legend uses shapes too (bar, outline, stripes, ring).
 */
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useMemo } from 'react';
import { Icon } from '@/components/Icon';
import type { BlockedRow, StayRow } from '@/data/types';
import { formatLongDay, formatMonthYear, weekdayMon0, type ISODate } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/labels';
import { calendarDay, monthGrid, type CalendarDay } from '@/lib/occupancy';
import { cx } from '@/lib/cx';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MonthCalendar({
  month,
  direction,
  onMonth,
  stays,
  blocked,
  today,
  selected,
  onSelect,
}: {
  month: string;
  /** +1 when moving forward, −1 back: decides the slide direction. */
  direction: number;
  onMonth: (step: 1 | -1) => void;
  stays: StayRow[];
  blocked: BlockedRow[];
  today: ISODate;
  selected: ISODate | null;
  onSelect: (d: ISODate) => void;
}) {
  const days = useMemo(() => monthGrid(month).map((d) => calendarDay(d, stays, blocked)), [month, stays, blocked]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) onMonth(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) onMonth(-1);
  };

  return (
    <div className="rounded-card border border-line bg-white p-3 pb-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onMonth(-1)} aria-label="Previous month" className="grid h-12 w-12 place-items-center rounded-full hover:bg-haldi">
          <Icon name="back" />
        </button>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.h2
            key={month}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            className="text-[18px] font-semibold"
            aria-live="polite"
          >
            {formatMonthYear(month)}
          </motion.h2>
        </AnimatePresence>
        <button type="button" onClick={() => onMonth(1)} aria-label="Next month" className="grid h-12 w-12 place-items-center rounded-full hover:bg-haldi">
          <Icon name="chevron" />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-7 text-center text-[13px] font-semibold text-muted" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>

      <div className="overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={month}
            custom={direction}
            initial={{ opacity: 0, x: direction * 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -80 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="grid touch-pan-y grid-cols-7 gap-y-1"
            role="group"
            aria-label={`${formatMonthYear(month)}. Swipe to change month.`}
          >
            {days.map((d) => (
              <DayCell key={d.date} day={d} inMonth={d.date.startsWith(month)} today={today} selected={selected === d.date} onSelect={onSelect} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 border-t border-line pt-2 text-[13px] text-muted" aria-label="Legend">
        <Legend swatch="h-3 w-5 rounded-full bg-peacock" label="Booked" />
        <Legend swatch="h-3 w-5 rounded-full border-2 border-dashed border-marigold bg-haldi" label="Tentative" />
        <Legend swatch="hatch h-3 w-5 rounded-full border border-line-strong" label="Blocked" />
        <Legend swatch="h-3.5 w-3.5 rounded-full ring-2 ring-marigold" label="Today" />
        <Legend swatch="h-3 w-5 rounded-full border border-line-strong bg-white" label="Free" />
      </ul>
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

function DayCell({
  day,
  inMonth,
  today,
  selected,
  onSelect,
}: {
  day: CalendarDay<StayRow, BlockedRow>;
  inMonth: boolean;
  today: ISODate;
  selected: boolean;
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
    day.stay ? `${day.stay.guest_name}, ${STATUS_LABEL[day.stay.status]}` : null,
    day.tentative ? `${day.tentative.guest_name}, tentative` : null,
    day.blocked ? `blocked, ${day.blocked.reason}` : null,
    !shown && !day.blocked ? 'free' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
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
          selected && 'bg-teak font-bold text-white',
        )}
      >
        {Number(day.date.slice(8))}
      </span>
    </button>
  );
}
