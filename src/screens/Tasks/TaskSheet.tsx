/**
 * Add or edit a task: what, when, for whom, and (optionally) which stay.
 * In-app only: nothing is sent and no phone notification is set.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { DateField, FieldLabel, Group, LabelledChips, TextField } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { APP_USERS, firstName } from '@/config/users';
import { useAddTask, useDeleteTask, useStays, useUpdateTask } from '@/data/hooks';
import type { TaskRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { addDays, formatRange, formatShortDay } from '@/lib/dates';
import { taskError } from '@/lib/tasks';
import { useCurrentUser } from '@/session/UserContext';
import { OfflineNote, SaveError } from '@/screens/Stay/MoneySheets';

const ANYONE = 'anyone';
type Who = typeof ANYONE | (typeof APP_USERS)[number];
const WHO: readonly Who[] = [ANYONE, ...APP_USERS];
const WHO_LABEL = Object.fromEntries(WHO.map((w) => [w, w === ANYONE ? 'Either of us' : firstName(w)])) as Record<Who, string>;

export function TaskSheet({
  open,
  onClose,
  task,
  stayId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Editing this task; omit to add a new one. */
  task?: TaskRow | null;
  /** Adding from a stay page: the task is linked to that stay. */
  stayId?: string;
  onSaved: (msg: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      {/* Remount each time it opens, so the form starts fresh. */}
      {open && <TaskForm task={task ?? null} fixedStayId={stayId} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function TaskForm({ task, fixedStayId, onClose, onSaved }: { task: TaskRow | null; fixedStayId?: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const stays = useStays();
  const add = useAddTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.due_on ?? today);
  const [who, setWho] = useState<Who>((task?.for_person as Who | null) ?? ANYONE);
  const [stayId, setStayId] = useState<string>(task?.stay_id ?? fixedStayId ?? '');
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Stays worth linking: anything not cancelled that hasn't long ended, plus the one already linked.
  const choices = useMemo(
    () =>
      (stays.data ?? [])
        .filter((s) => s.stay_id === stayId || (s.status !== 'cancelled' && s.check_out >= addDays(today, -7)))
        .sort((a, b) => (a.check_in < b.check_in ? -1 : 1)),
    [stays.data, stayId, today],
  );
  const fixedStay = fixedStayId ? stays.data?.find((s) => s.stay_id === fixedStayId) : undefined;

  const error = taskError(title, due);
  const busy = add.isPending || update.isPending || remove.isPending;
  const edit = { title: title.trim(), due_on: due, for_person: who === ANYONE ? null : who, stay_id: stayId || null };

  const save = () => {
    setTried(true);
    if (error) return;
    const done = () => {
      onSaved(task ? 'Task updated' : 'Task added');
      onClose();
    };
    if (task) update.mutate({ id: task.id, edit }, { onSuccess: done });
    else add.mutate({ ...edit, created_by: user }, { onSuccess: done });
  };

  const del = () => {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(task.id, {
      onSuccess: () => {
        onSaved('Task deleted');
        onClose();
      },
    });
  };

  const quick: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['In a week', addDays(today, 7)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="What needs doing?"
        value={title}
        onChange={setTitle}
        placeholder="e.g. Call the plumber"
        autoCapitalize="sentences"
        autoComplete="off"
        maxLength={200}
        error={tried ? (error && !title.trim() ? error : null) : null}
      />

      <div className="flex flex-col gap-2.5">
        <DateField label="Due" hint={formatShortDay(due)} value={due} onChange={setDue} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick dates">
          {quick.map(([label, d]) => (
            <button
              key={label}
              type="button"
              aria-pressed={due === d}
              onClick={() => setDue(d)}
              className={
                due === d
                  ? 'min-h-touch rounded-full border border-peacock bg-peacock px-4 text-[15px] font-medium text-white'
                  : 'min-h-touch rounded-full border border-line-strong bg-white px-4 text-[15px] font-medium text-teak hover:border-peacock/40'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Group label="For">
        <LabelledChips label="For" options={WHO} labels={WHO_LABEL} value={who} onChange={setWho} />
      </Group>

      {fixedStayId ? (
        fixedStay && (
          <p className="rounded-2xl bg-haldi px-4 py-3 text-[15px]">
            For <strong className="font-semibold">{fixedStay.guest_name}</strong>’s stay, {formatRange(fixedStay.check_in, fixedStay.check_out)}
          </p>
        )
      ) : (
        <div>
          <FieldLabel htmlFor="task-stay" hint="Optional">
            About a stay
          </FieldLabel>
          <select
            id="task-stay"
            value={stayId}
            onChange={(e) => setStayId(e.target.value)}
            className="min-h-touch w-full rounded-2xl border border-line-strong bg-white px-4 text-[17px] text-teak focus:border-peacock focus:shadow-[0_0_0_4px_rgba(15,94,90,0.12)] focus:outline-none"
          >
            <option value="">No stay</option>
            {choices.map((s) => (
              <option key={s.stay_id} value={s.stay_id}>
                {s.guest_name} · {formatRange(s.check_in, s.check_out)}
              </option>
            ))}
          </select>
        </div>
      )}

      {tried && error && title.trim() && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {error}
        </p>
      )}
      <SaveError error={add.error ?? update.error ?? remove.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!online || busy} onClick={save}>
        {add.isPending || update.isPending ? 'Saving…' : task ? 'Save changes' : 'Add task'}
      </Button>
      {task && (
        <Button block variant={confirmDelete ? 'danger' : 'ghost'} disabled={!online || busy} onClick={del}>
          {remove.isPending ? 'Deleting…' : confirmDelete ? 'Tap again to delete' : 'Delete task'}
        </Button>
      )}
    </div>
  );
}
