import { AnimatePresence, motion } from 'motion/react';
import { useId } from 'react';
import { Chips, FieldLabel, Group, Segmented, Stepper, TextField, Toggle } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import type { BlockedRow, StayRow } from '@/data/types';
import { formatDayMonth, formatRange, formatShortDay, nightsBetween } from '@/lib/dates';
import { OCCASIONS, SOURCES, STATUS_LABEL, plural } from '@/lib/labels';
import type { Conflicts } from '@/lib/occupancy';
import { checkOutOf, type BookingStatus, type Draft } from './draft';

export function StepStay({
  draft,
  set,
  conflicts,
  checking,
}: {
  draft: Draft;
  set: (p: Partial<Draft>) => void;
  conflicts: Conflicts<StayRow, BlockedRow>;
  checking: boolean;
}) {
  const dateId = useId();
  const checkOut = checkOutOf(draft);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <FieldLabel htmlFor={dateId} hint={formatShortDay(draft.checkIn)}>
          Check-in
        </FieldLabel>
        <input
          id={dateId}
          type="date"
          value={draft.checkIn}
          onChange={(e) => e.target.value && set({ checkIn: e.target.value })}
          className="num min-h-touch w-full rounded-2xl border border-line-strong bg-white px-4 text-[18px] font-semibold focus:border-peacock focus:outline-none"
        />
      </div>

      <Group label="Nights" hint={`Check-out ${formatShortDay(checkOut)}`}>
        <Stepper label="Nights" value={draft.nights} min={1} max={60} onChange={(n) => set({ nights: n })} />
      </Group>

      <Availability conflicts={conflicts} checking={checking} checkIn={draft.checkIn} checkOut={checkOut} />

      <Group label="Guests" hint={draft.guestsCount > 8 ? 'The floor sleeps about 8' : undefined}>
        <Stepper label="Guests" value={draft.guestsCount} min={1} max={20} onChange={(n) => set({ guestsCount: n })} />
      </Group>

      <div className="rounded-card border border-line bg-white px-4 py-1">
        <Toggle label="Driver room" hint="Separate room for a driver or helper" checked={draft.driverRoom} onChange={(v) => set({ driverRoom: v })} />
      </div>

      <Group label="Booking is">
        <Segmented<BookingStatus>
          label="Booking status"
          name="status"
          value={draft.status}
          onChange={(v) => set({ status: v })}
          options={[
            { value: 'enquiry', label: 'Enquiry' },
            { value: 'tentative', label: 'Tentative' },
            { value: 'confirmed', label: 'Confirmed' },
          ]}
        />
      </Group>

      <Group label="Occasion" hint="Optional">
        <Chips label="Occasion" options={OCCASIONS} value={draft.occasion as (typeof OCCASIONS)[number] | null} onChange={(v) => set({ occasion: v })} />
      </Group>

      <Group label="How they found us" hint="Optional">
        <Chips label="Source" options={SOURCES} value={draft.source as (typeof SOURCES)[number] | null} onChange={(v) => set({ source: v })} />
      </Group>

      <TextField label="Notes" hint="Optional" value={draft.notes} onChange={(v) => set({ notes: v })} placeholder="Anything to remember" />
    </div>
  );
}

function Availability({
  conflicts,
  checking,
  checkIn,
  checkOut,
}: {
  conflicts: Conflicts<StayRow, BlockedRow>;
  checking: boolean;
  checkIn: string;
  checkOut: string;
}) {
  const { hard, tentative, blocked } = conflicts;
  const free = !checking && hard.length === 0 && tentative.length === 0 && blocked.length === 0;
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {checking && (
          <motion.p key="checking" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[14px] text-muted">
            Checking the dates…
          </motion.p>
        )}
        {free && (
          <motion.div key="free" layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5 rounded-2xl bg-leaf/15 px-4 py-3 text-[15px] text-peacock">
            <Icon name="check" size={20} />
            <span>
              The floor is free {formatRange(checkIn, checkOut)} ({plural(nightsBetween(checkIn, checkOut), 'night')})
            </span>
          </motion.div>
        )}
        {hard.map((s) => (
          <motion.div key={s.stay_id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex gap-2.5 rounded-2xl border border-terracotta-100 bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">Already booked:</strong> {s.guest_name}, {formatRange(s.check_in, s.check_out)} ({STATUS_LABEL[s.status]}). Pick other dates.
            </span>
          </motion.div>
        ))}
        {tentative.map((s) => (
          <motion.div key={s.stay_id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2.5 rounded-2xl bg-haldi px-4 py-3 text-[15px] text-teak">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-marigold" />
            <span>
              <strong className="font-semibold">Tentative hold:</strong> {s.guest_name}, {formatRange(s.check_in, s.check_out)}. You can still save.
            </span>
          </motion.div>
        ))}
        {blocked.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2.5 rounded-2xl bg-haldi px-4 py-3 text-[15px] text-teak">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-marigold" />
            <span>
              <strong className="font-semibold">Blocked:</strong> {b.reason}, {b.start_date === b.end_date ? formatDayMonth(b.start_date) : formatRange(b.start_date, b.end_date)}. You can still save.
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
