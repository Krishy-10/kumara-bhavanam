/**
 * Stay detail: the checklist for where the stay is (before check-in, or at
 * check-out), and the tasks linked to the stay. Ticks are per stay and record
 * who ticked and when. They warn, never block (see ConfirmMove).
 */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Layout';
import { firstName } from '@/config/users';
import { useChecklistItems, useSetTaskDone, useTasks, useTicks, useToggleTick } from '@/data/hooks';
import type { ChecklistStage, StayRow, TaskRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatDayMonth, istDate } from '@/lib/dates';
import { STAGE_LABEL, checklistProgress, stageFor, stageItems } from '@/lib/tasks';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/session/UserContext';
import { TaskItem, TickBox } from '@/screens/Tasks/TaskItems';
import { TaskSheet } from '@/screens/Tasks/TaskSheet';

/** How many items of each list are still unticked for this stay (0 while loading). */
export function useChecklistLeft(stayId: string): Record<ChecklistStage, number> {
  const items = useChecklistItems();
  const ticks = useTicks([stayId]);
  if (!items.data || !ticks.data) return { before_check_in: 0, at_check_out: 0 };
  return {
    before_check_in: checklistProgress(items.data, ticks.data, stayId, 'before_check_in').left,
    at_check_out: checklistProgress(items.data, ticks.data, stayId, 'at_check_out').left,
  };
}

export function ChecklistCard({ stay, onError }: { stay: StayRow; onError: (msg: string) => void }) {
  const stage = stageFor(stay.status);
  const items = useChecklistItems();
  const ticks = useTicks([stay.stay_id]);
  const toggle = useToggleTick();
  const user = useCurrentUser();
  const online = useOnline();
  const [openWhenDone, setOpenWhenDone] = useState(false);

  if (!stage) return null;
  if (items.isPending || ticks.isPending) return <Skeleton className="mx-4 mt-3 h-[88px]" />;
  if (!items.data || !ticks.data) return null;

  const list = stageItems(items.data, stage);
  if (list.length === 0) return null;
  const p = checklistProgress(items.data, ticks.data, stay.stay_id, stage);
  const complete = p.left === 0;
  const expanded = !complete || openWhenDone;
  const headingId = `checklist-${stage}`;

  return (
    <section id="checklist" aria-labelledby={headingId} className="mx-4 mt-3 rounded-card border border-line bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id={headingId} className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          {STAGE_LABEL[stage]}
        </h2>
        <span className={cx('num text-[14px] font-semibold', complete ? 'text-peacock' : 'text-teak')} aria-live="polite">
          {complete ? 'All done' : `${p.done} of ${p.total} done`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${STAGE_LABEL[stage]} checklist`}
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={p.done}
        className="mx-1 mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <motion.div className="h-full rounded-full bg-peacock" initial={false} animate={{ width: `${(p.done / p.total) * 100}%` }} transition={{ duration: 0.35 }} />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-1 overflow-hidden">
            {list.map((it) => {
              const t = p.ticks.get(it.id);
              return (
                <li key={it.id} className="flex items-center gap-1">
                  <TickBox
                    checked={!!t}
                    label={it.label}
                    disabled={!online}
                    onToggle={() =>
                      toggle.mutate(
                        { stayId: stay.stay_id, itemId: it.id, by: user, ticked: !t },
                        { onError: (e) => onError(e.message) },
                      )
                    }
                  />
                  <span className="flex min-w-0 flex-1 flex-col py-1">
                    <span className={cx('text-[16px]', t && 'text-muted line-through')}>{it.label}</span>
                    {t && !t.id.startsWith('pending-') && (
                      <span className="text-[13px] text-muted">
                        {firstName(t.created_by)} · {formatDayMonth(istDate(t.created_at))}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="mt-1 flex items-center justify-between gap-2 px-1">
        {complete ? (
          <button type="button" aria-expanded={openWhenDone} onClick={() => setOpenWhenDone((v) => !v)} className="min-h-touch text-[15px] font-semibold text-peacock">
            {openWhenDone ? 'Hide list' : 'Show list'}
          </button>
        ) : (
          <span />
        )}
        <Link to={stage === 'at_check_out' ? '/checklists?stage=at_check_out' : '/checklists'} className="flex min-h-touch items-center text-[15px] font-semibold text-peacock">
          Edit list
        </Link>
      </div>
    </section>
  );
}

/** Tasks linked to this stay, with a button to add one. */
export function StayTasksCard({ stay, onSaved }: { stay: StayRow; onSaved: (msg: string) => void }) {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const tasks = useTasks();
  const setDone = useSetTaskDone();
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [adding, setAdding] = useState(false);

  const mine = (tasks.data ?? []).filter((t) => t.stay_id === stay.stay_id).sort((a, b) => {
    if ((a.done_at === null) !== (b.done_at === null)) return a.done_at === null ? -1 : 1;
    return a.due_on < b.due_on ? -1 : 1;
  });

  return (
    <section aria-labelledby="stay-tasks-h" className="mx-4 mt-3 rounded-card border border-line bg-white px-3 py-3">
      <h2 id="stay-tasks-h" className="px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
        Tasks for this stay
      </h2>
      {tasks.isPending ? (
        <Skeleton className="mt-2 h-12" />
      ) : (
        mine.length > 0 && (
          <ul className="mt-1 flex flex-col">
            {mine.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                today={today}
                disabled={!online}
                onOpen={() => setEditing(t)}
                onToggle={() => setDone.mutate({ id: t.id, by: t.done_at ? null : user }, { onError: (e) => onSaved(e.message) })}
              />
            ))}
          </ul>
        )
      )}
      <Button variant="ghost" block icon={<Icon name="plus" size={20} />} className="mt-1" disabled={!online} onClick={() => setAdding(true)}>
        Add task
      </Button>
      <TaskSheet
        open={adding || editing !== null}
        task={editing}
        stayId={stay.stay_id}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={onSaved}
      />
    </section>
  );
}
