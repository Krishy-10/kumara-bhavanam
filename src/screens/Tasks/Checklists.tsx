/**
 * The shared checklists (before check-in, at check-out). Either owner can add,
 * rename, reorder or remove items; both phones see the same list. Removing
 * keeps the item in the database (old stays' ticks still point at it).
 */
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Segmented, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { useAddChecklistItem, useArchiveChecklistItem, useChecklistItems, useRenameChecklistItem, useSetChecklistOrder } from '@/data/hooks';
import type { ChecklistItemRow, ChecklistStage } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { CHECKLIST_STAGES, STAGE_LABEL, stageItems } from '@/lib/tasks';
import { useCurrentUser } from '@/session/UserContext';
import { OfflineNote, SaveError } from '@/screens/Stay/MoneySheets';

const STAGE_HINT: Record<ChecklistStage, string> = {
  before_check_in: 'Shown on a booking until the guests arrive. Home reminds you the day before.',
  at_check_out: 'Shown once the guests are in, for the day they leave.',
};

export function Checklists() {
  const [params, setParams] = useSearchParams();
  const stage: ChecklistStage = params.get('stage') === 'at_check_out' ? 'at_check_out' : 'before_check_in';
  const items = useChecklistItems();
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddChecklistItem();
  const order = useSetChecklistOrder();
  const { toast, show, hide } = useToast();
  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<ChecklistItemRow | null>(null);

  const list = stageItems(items.data ?? [], stage);

  const addItem = () => {
    const text = label.trim();
    if (!text) return;
    const last = list[list.length - 1];
    add.mutate(
      { stage, label: text, sort_order: (last?.sort_order ?? 0) + 10, created_by: user },
      {
        onSuccess: () => {
          setLabel('');
          show({ text: 'Added to the list' });
        },
      },
    );
  };

  // Swap with the neighbour, then renumber the whole stage 10, 20, 30… so ties can't stick.
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    order.mutate(
      next.map((it, k) => ({ id: it.id, sort_order: (k + 1) * 10 })),
      { onError: (e) => show({ text: e.message, tone: 'error' }) },
    );
  };

  return (
    <Screen withNav={false}>
      <SubHeader title="Checklists" subtitle="The same list on both phones" />
      <div className="flex flex-col gap-4 px-[18px] pb-6">
        <Segmented
          label="Which checklist"
          name="checklist-stage"
          value={stage}
          onChange={(v) => setParams(v === 'at_check_out' ? { stage: v } : {}, { replace: true })}
          options={CHECKLIST_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
        />
        <p className="px-1 text-[14px] text-muted">{STAGE_HINT[stage]}</p>

        {items.error ? (
          <ErrorState message={items.error.message} onRetry={() => void items.refetch()} />
        ) : items.isPending ? (
          <Skeleton className="h-64" />
        ) : (
          <ol className="flex flex-col rounded-card border border-line bg-white px-2 py-1" aria-label={STAGE_LABEL[stage]}>
            <AnimatePresence initial={false}>
              {list.map((it, i) => (
                <motion.li key={it.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 border-b border-line last:border-b-0">
                  <span className="num w-7 shrink-0 text-center text-[14px] text-muted">{i + 1}</span>
                  <button type="button" onClick={() => setEditing(it)} className="min-h-touch min-w-0 flex-1 rounded-xl px-1 text-left text-[16px] hover:bg-haldi/60" aria-label={`${it.label}. Rename or remove`}>
                    {it.label}
                  </button>
                  <OrderButton icon="up" label={`Move “${it.label}” up`} onClick={() => move(i, -1)} disabled={i === 0 || !online || order.isPending} />
                  <OrderButton icon="down" label={`Move “${it.label}” down`} onClick={() => move(i, 1)} disabled={i === list.length - 1 || !online || order.isPending} />
                </motion.li>
              ))}
            </AnimatePresence>
            {list.length === 0 && <li className="px-2 py-4 text-[15px] text-muted">No items yet. Add the first one below.</li>}
          </ol>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addItem();
          }}
        >
          <TextField className="flex-1" label="Add an item" value={label} onChange={setLabel} placeholder="e.g. Fill the gas cylinder" maxLength={120} autoComplete="off" />
          <Button type="submit" disabled={!online || !label.trim() || add.isPending}>
            Add
          </Button>
        </form>
        <SaveError error={add.error} />
        {!online && <OfflineNote />}
      </div>

      <EditItemSheet item={editing} onClose={() => setEditing(null)} onSaved={(text) => show({ text })} />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function OrderButton({ icon, label, onClick, disabled }: { icon: 'up' | 'down'; label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid h-12 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-line/60 disabled:opacity-30">
      <Icon name={icon} size={20} />
    </button>
  );
}

function EditItemSheet({ item, onClose, onSaved }: { item: ChecklistItemRow | null; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={item !== null} onClose={onClose} title="Checklist item">
      {item && <EditItemForm item={item} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function EditItemForm({ item, onClose, onSaved }: { item: ChecklistItemRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const online = useOnline();
  const rename = useRenameChecklistItem();
  const archive = useArchiveChecklistItem();
  const [label, setLabel] = useState(item.label);
  const busy = rename.isPending || archive.isPending;
  return (
    <div className="flex flex-col gap-5">
      <TextField label="Item" value={label} onChange={setLabel} maxLength={120} autoComplete="off" />
      <SaveError error={rename.error ?? archive.error} />
      <Button
        size="lg"
        block
        disabled={!online || busy || !label.trim() || label.trim() === item.label}
        onClick={() =>
          rename.mutate(
            { id: item.id, label: label.trim() },
            {
              onSuccess: () => {
                onSaved('Item renamed');
                onClose();
              },
            },
          )
        }
      >
        {rename.isPending ? 'Saving…' : 'Save'}
      </Button>
      <Button
        block
        variant="danger"
        disabled={!online || busy}
        onClick={() =>
          archive.mutate(item.id, {
            onSuccess: () => {
              onSaved('Removed from the list');
              onClose();
            },
          })
        }
      >
        Remove from the list
      </Button>
      <p className="text-center text-[13px] text-muted">Past stays keep their ticks.</p>
    </div>
  );
}
