/**
 * Tasks: the automatic reminders, then the owners' own to-dos by when they're
 * due. Everything stays in the app; nothing is sent.
 */
import { AnimatePresence } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { Toast, useToast } from '@/components/Toast';
import { useSetTaskDone, useStays, useTasks } from '@/data/hooks';
import type { TaskRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { plural } from '@/lib/labels';
import { DONE_KEEP_DAYS, groupTasks, isForMe, type TaskFilter } from '@/lib/tasks';
import { useCurrentUser } from '@/session/UserContext';
import { ReminderItem, TaskItem } from './TaskItems';
import { TaskSheet } from './TaskSheet';
import { useReminders } from './useReminders';

export function Tasks() {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const filter: TaskFilter = params.get('show') === 'mine' ? 'mine' : 'all';
  const tasks = useTasks();
  const stays = useStays();
  const rem = useReminders(today);
  const setDone = useSetTaskDone();
  const { toast, show, hide } = useToast();
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [showDone, setShowDone] = useState(false);

  const stayName = useMemo(() => new Map((stays.data ?? []).map((s) => [s.stay_id, s.guest_name])), [stays.data]);
  const visible = useMemo(() => (tasks.data ?? []).filter((t) => filter === 'all' || isForMe(t, user)), [tasks.data, filter, user]);
  const g = groupTasks(visible, today);

  const toggle = (t: TaskRow) => {
    const by = t.done_at ? null : user;
    setDone.mutate(
      { id: t.id, by },
      {
        onSuccess: () =>
          by && show({ text: 'Marked done', action: { label: 'Undo', onClick: () => setDone.mutate({ id: t.id, by: null }) } }),
        onError: (e) => show({ text: e.message, tone: 'error' }),
      },
    );
  };

  const row = (t: TaskRow) => (
    <TaskItem
      key={t.id}
      task={t}
      today={today}
      stayName={t.stay_id ? stayName.get(t.stay_id) : undefined}
      onToggle={() => toggle(t)}
      onOpen={() => setEditing(t)}
      disabled={!online}
    />
  );

  const error = tasks.error ?? rem.error;
  const loading = tasks.isPending || rem.isPending;
  const open = g.overdue.length + g.today.length + g.upcoming.length;

  return (
    <Screen>
      <SubHeader
        title="Tasks"
        subtitle="Reminders and to-dos, in the app only"
        right={
          <Link to="/checklists" className="mr-3 flex min-h-touch items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-peacock">
            <Icon name="tasks" size={20} />
            Checklists
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-[18px] pb-4">
        <Segmented
          label="Show tasks"
          name="task-filter"
          value={filter}
          onChange={(v) => setParams(v === 'mine' ? { show: 'mine' } : {}, { replace: true })}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'mine', label: 'Mine' },
          ]}
        />

        {error ? (
          <ErrorState
            message={error.message}
            onRetry={() => {
              void tasks.refetch();
              rem.refetch();
            }}
          />
        ) : loading ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <>
            {rem.data && rem.data.length > 0 && (
              <Section title="Reminders" note="From your bookings">
                {rem.data.map((r) => (
                  <ReminderItem key={r.key} r={r} today={today} />
                ))}
              </Section>
            )}
            {g.overdue.length > 0 && <Section title="Late" count={g.overdue.length}>{g.overdue.map(row)}</Section>}
            {g.today.length > 0 && <Section title="Today" count={g.today.length}>{g.today.map(row)}</Section>}
            {g.upcoming.length > 0 && <Section title="Coming up" count={g.upcoming.length}>{g.upcoming.map(row)}</Section>}

            {open === 0 && (
              <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-line-strong bg-white px-6 py-8 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-leaf/15 text-peacock" aria-hidden="true">
                  <Icon name="check" size={24} />
                </span>
                <span className="mt-1 text-[17px] font-semibold">Nothing to do</span>
                <span className="text-[15px] text-muted">{filter === 'mine' ? 'No open tasks for you.' : 'No open tasks.'} Add one below.</span>
              </div>
            )}

            {g.done.length > 0 && (
              <section aria-label="Done" className="rounded-card border border-line bg-white px-3 py-1">
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => setShowDone((v) => !v)}
                  className="flex min-h-touch w-full items-center justify-between px-1 text-left"
                >
                  <span className="text-[15px] font-semibold">
                    Done <span className="font-normal text-muted">· {plural(g.done.length, 'task')} in the last {DONE_KEEP_DAYS} days</span>
                  </span>
                  <Icon name="chevron" size={18} className={showDone ? '-rotate-90 text-muted transition-transform' : 'rotate-90 text-muted transition-transform'} />
                </button>
                {showDone && <ul className="flex flex-col pb-1">{g.done.map(row)}</ul>}
              </section>
            )}
          </>
        )}
      </div>

      <div className="mt-auto px-[18px] pb-3 pt-2">
        <Button size="lg" block icon={<Icon name="plus" size={22} strokeWidth={2.4} />} onClick={() => setAdding(true)} disabled={!online}>
          Add task
        </Button>
      </div>

      <TaskSheet
        open={adding || editing !== null}
        task={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
          if (params.get('add')) setParams(filter === 'mine' ? { show: 'mine' } : {}, { replace: true });
        }}
        onSaved={(text) => show({ text })}
      />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function Section({ title, count, note, children }: { title: string; count?: number; note?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-card border border-line bg-white px-3 py-2">
      <h2 className="flex items-baseline justify-between px-1 pb-1 pt-1">
        <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          {title}
          {count !== undefined && <span className="num"> · {count}</span>}
        </span>
        {note && <span className="text-[12px] text-muted">{note}</span>}
      </h2>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}
