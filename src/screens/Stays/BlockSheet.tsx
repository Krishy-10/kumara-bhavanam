/** "Block dates": maintenance or family use. Both dates included. Warns, never blocks a booking. */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Chips, DateField, Group, TextField } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useAddBlocked } from '@/data/hooks';
import type { StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { addDays, formatRange, formatShortDay, nightsBetween, type ISODate } from '@/lib/dates';
import { BLOCK_REASONS, STATUS_LABEL, plural } from '@/lib/labels';
import { findConflicts } from '@/lib/occupancy';
import { useCurrentUser } from '@/session/UserContext';

export function BlockSheet({ open, onClose, from, stays, onSaved }: { open: boolean; onClose: () => void; from: ISODate; stays: StayRow[]; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Block dates">
      {open && <BlockForm from={from} stays={stays} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function BlockForm({ from, stays, onClose, onSaved }: { from: ISODate; stays: StayRow[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddBlocked();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(from);
  const [pick, setPick] = useState<string | null>('Maintenance');
  const [other, setOther] = useState('');
  const reason = pick === 'Other' ? other.trim() : pick;
  const endOk = end >= start;
  // Blocked dates include both ends, so the nights covered are [start, end + 1).
  const clash = endOk ? findConflicts(stays, [], start, addDays(end, 1)) : null;
  const clashes = clash ? [...clash.hard, ...clash.tentative] : [];
  const days = endOk ? nightsBetween(start, end) + 1 : 0;

  const save = () => {
    if (!reason || !endOk) return;
    add.mutate(
      { start_date: start, end_date: end, reason, created_by: user },
      {
        onSuccess: () => {
          onSaved(`Blocked ${start === end ? formatShortDay(start) : formatRange(start, end)}`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <DateField
          label="From"
          value={start}
          onChange={(v) => {
            setStart(v);
            if (end < v) setEnd(v);
          }}
        />
        <DateField label="To (included)" value={end} min={start} onChange={setEnd} />
      </div>
      <p className="-mt-2 text-[14px] text-muted" aria-live="polite">
        {endOk ? `${plural(days, 'day')} blocked, ${start === end ? formatShortDay(start) : `${formatShortDay(start)} to ${formatShortDay(end)}`}` : 'The end date is before the start.'}
      </p>
      <Group label="Why">
        <Chips label="Reason" options={BLOCK_REASONS} value={pick} onChange={setPick} />
      </Group>
      {pick === 'Other' && <TextField label="Reason" value={other} onChange={setOther} placeholder="e.g. Painting" />}
      {clashes.length > 0 && (
        <div role="alert" className="rounded-2xl bg-haldi px-4 py-3 text-[15px]">
          <strong className="font-semibold">Already booked on these dates:</strong>
          <ul className="mt-1">
            {clashes.map((s) => (
              <li key={s.stay_id}>
                {s.guest_name}, {formatRange(s.check_in, s.check_out)} ({STATUS_LABEL[s.status]})
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">Blocking won’t cancel the booking. Sort it out with the guest first.</p>
        </div>
      )}
      {add.error && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {add.error.message}
        </p>
      )}
      <Button size="lg" block disabled={!reason || !endOk || !online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : 'Block these dates'}
      </Button>
    </div>
  );
}
