/** One task row (tick box + text) and one reminder row, shared by Home, Tasks and Stay detail. */
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Icon } from '@/components/Icon';
import { firstName } from '@/config/users';
import type { TaskRow } from '@/data/types';
import { formatDayMonth, formatShortDay, istDate } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { plural } from '@/lib/labels';
import { dueLabel, type Reminder } from '@/lib/tasks';
import { cx } from '@/lib/cx';

/** The round tick box: a real checkbox for screen readers, 48px to tap. */
export function TickBox({ checked, label, onToggle, disabled }: { checked: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full disabled:opacity-40"
    >
      <motion.span
        animate={{ scale: checked ? [1, 1.15, 1] : 1 }}
        transition={{ duration: 0.25 }}
        className={cx(
          'grid h-7 w-7 place-items-center rounded-full border-2 transition-colors',
          checked ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-transparent',
        )}
      >
        <Icon name="check" size={16} strokeWidth={3} />
      </motion.span>
    </button>
  );
}

export function TaskItem({
  task,
  today,
  stayName,
  onToggle,
  onOpen,
  disabled,
}: {
  task: TaskRow;
  today: string;
  /** The linked stay's guest, when the row isn't already on that stay's page. */
  stayName?: string;
  onToggle: () => void;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const done = task.done_at !== null;
  const late = !done && task.due_on < today;
  const meta = done
    ? [`Done by ${firstName(task.done_by ?? '')}`, formatDayMonth(istDate(task.done_at!))]
    : [dueLabel(task.due_on, today), task.for_person ? `For ${firstName(task.for_person)}` : null, stayName ?? null];
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
      <TickBox checked={done} label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`} onToggle={onToggle} disabled={disabled} />
      <button type="button" onClick={onOpen} className="flex min-h-touch min-w-0 flex-1 flex-col justify-center rounded-xl py-1.5 pr-2 text-left hover:bg-haldi/60">
        <span className={cx('text-[16px] font-semibold', done && 'text-muted line-through')}>{task.title}</span>
        <span className={cx('text-[13px]', late ? 'font-semibold text-terracotta' : 'text-muted')}>{meta.filter(Boolean).join(' · ')}</span>
      </button>
    </motion.li>
  );
}

export function ReminderItem({ r, today }: { r: Reminder; today: string }) {
  const first = firstName(r.stay.guest_name);
  const [icon, title, sub, tone] =
    r.kind === 'prep'
      ? ([
          'bed',
          `Get the floor ready for ${first}`,
          `Arrives ${r.when} · ${plural(r.left, 'item')} left of ${r.total}`,
          'bg-haldi text-teak',
        ] as const)
      : ([
          'rupee',
          `Collect ${formatRupees(r.amount)} from ${first}`,
          r.stay.status === 'checked_in'
            ? r.stay.check_out === today
              ? 'Leaves today'
              : `Staying · leaves ${formatShortDay(r.stay.check_out)}`
            : `Checked out ${formatDayMonth(r.stay.check_out)}`,
          'bg-terracotta-50 text-terracotta',
        ] as const);
  return (
    <li>
      <Link to={`/stays/${r.stay.stay_id}`} className="flex min-h-[60px] items-center gap-3 rounded-xl py-1.5 pr-1 hover:bg-haldi/60">
        <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', tone)} aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-semibold">{title}</span>
          <span className="text-[13px] text-muted">{sub}</span>
        </span>
        <Icon name="chevron" size={18} className="text-muted" />
      </Link>
    </li>
  );
}
