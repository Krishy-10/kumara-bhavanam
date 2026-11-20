/** Home: what needs doing today. Reminders first, then late and today's tasks. */
import { AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Layout';
import { useSetTaskDone, useStays, useTasks } from '@/data/hooks';
import { useOnline } from '@/hooks/useOnline';
import { plural } from '@/lib/labels';
import { groupTasks } from '@/lib/tasks';
import { useCurrentUser } from '@/session/UserContext';
import { ReminderItem, TaskItem } from './TaskItems';
import { useReminders } from './useReminders';

const SHOW = 5;

export function TodayCard({ today, onMessage }: { today: string; onMessage: (text: string, undo?: () => void) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const tasks = useTasks();
  const stays = useStays();
  const rem = useReminders(today);
  const setDone = useSetTaskDone();
  const navigate = useNavigate();

  if (tasks.isPending || rem.isPending) return <Skeleton className="h-[120px]" />;
  if (tasks.error || rem.error || !tasks.data || !rem.data) return null;

  const g = groupTasks(tasks.data, today);
  const due = [...g.overdue, ...g.today];
  const all = rem.data.length + due.length;
  const shownRem = rem.data.slice(0, SHOW);
  const shownTasks = due.slice(0, Math.max(0, SHOW - shownRem.length));
  const more = all - shownRem.length - shownTasks.length;
  const name = (id: string | null) => (id ? stays.data?.find((s) => s.stay_id === id)?.guest_name : undefined);

  return (
    <section aria-labelledby="today-h" className="rounded-card border border-line bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="today-h" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          To do today{all > 0 && <span className="num"> · {all}</span>}
        </h2>
        <Link to="/tasks" className="flex min-h-touch items-center gap-0.5 text-[15px] font-semibold text-peacock">
          {more > 0 ? `${more} more` : 'All tasks'}
          <Icon name="chevron" size={18} />
        </Link>
      </div>

      {all === 0 ? (
        <Link to="/tasks?add=1" className="flex min-h-touch items-center gap-3 rounded-xl px-1 pb-1 hover:bg-haldi/60">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf/15 text-peacock" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-[16px] font-semibold">Nothing due today</span>
            <span className="text-[13px] text-muted">{g.upcoming.length > 0 ? `${plural(g.upcoming.length, 'task')} coming up · ` : ''}Tap to add a task</span>
          </span>
        </Link>
      ) : (
        <ul className="flex flex-col">
          {shownRem.map((r) => (
            <ReminderItem key={r.key} r={r} today={today} />
          ))}
          <AnimatePresence initial={false}>
            {shownTasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                today={today}
                stayName={name(t.stay_id)}
                disabled={!online}
                onOpen={() => navigate('/tasks')}
                onToggle={() =>
                  setDone.mutate(
                    { id: t.id, by: user },
                    {
                      onSuccess: () => onMessage(`Done: ${t.title}`, () => setDone.mutate({ id: t.id, by: null })),
                      onError: (e) => onMessage(e.message),
                    },
                  )
                }
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
