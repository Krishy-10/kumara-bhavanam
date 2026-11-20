/**
 * Ledger → Add past stay: one short form for a stay from before the app was
 * used. Saved as Completed, fixed price, with what they paid recorded as a
 * payment on the date paid. A bill number is issued as for any booking.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Chips, DateField, Group, LabelledChips, MoneyField, MultiChips, Stepper, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { Screen, SubHeader } from '@/components/Layout';
import { useCreateBooking, useGuestByPhone, useStays } from '@/data/hooks';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatRange, formatShortDay } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { OCCASIONS, PAYMENT_MODE_LABEL, SOURCES, STATUS_LABEL, plural } from '@/lib/labels';
import { balanceState, dueAfterAdvance } from '@/lib/money';
import { normalizePhone } from '@/lib/phone';
import { useCurrentUser } from '@/session/UserContext';
import { hasReferral, toggleSource } from '@/screens/NewBooking/draft';
import { ReferrerField } from '@/screens/NewBooking/ReferrerField';
import { MODES, OfflineNote, SaveError } from '@/screens/Stay/MoneySheets';
import { newPastStay, pastNights, pastStayError, pastStayPayload, type PastStay } from './pastStay';

export function AddPastStay() {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const navigate = useNavigate();
  const stays = useStays();
  const create = useCreateBooking();
  const [p, setP] = useState<PastStay>(() => newPastStay(today));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<PastStay>) => setP((cur) => ({ ...cur, ...patch }));

  // A known phone fills in the name (and the guest is reused, never duplicated).
  const phone = normalizePhone(p.phone);
  const known = useGuestByPhone(phone);
  useEffect(() => {
    if (known.data && !p.name.trim()) set({ name: known.data.name });
    // Only when a guest is found for a new number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known.data]);

  const error = pastStayError(p, today);
  const nights = pastNights(p);
  const overlapping = useMemo(
    () =>
      nights > 0
        ? (stays.data ?? []).filter((s) => s.status !== 'cancelled' && s.check_in < p.checkOut && p.checkIn < s.check_out)
        : [],
    [stays.data, p.checkIn, p.checkOut, nights],
  );
  const after = p.total !== null && p.total > 0 ? balanceState(dueAfterAdvance(p.total, p.paid ?? 0)) : null;

  const save = () => {
    setTried(true);
    if (error) return;
    create.mutate(pastStayPayload(p, user), {
      onSuccess: (r) => navigate(`/stays/${r.stay_id}`, { replace: true, state: { saved: r.bill_no } }),
    });
  };

  return (
    <Screen withNav={false}>
      <SubHeader title="Add past stay" subtitle="A stay from before you used the app" />
      <div className="flex flex-col gap-6 px-[18px] pb-4 pt-2">
        <p className="rounded-2xl bg-haldi px-4 py-3 text-[15px]">
          Saved as <strong className="font-semibold">Completed</strong> with its own bill number. Anything still unpaid shows under To collect.
        </p>

        <section className="flex flex-col gap-4" aria-label="Guest">
          <TextField
            label="Phone"
            value={p.phone}
            onChange={(v) => set({ phone: v })}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="98431 12345"
            hint={known.data ? 'Guest already in your list' : undefined}
          />
          <TextField label="Guest’s name" value={p.name} onChange={(v) => set({ name: v })} autoCapitalize="words" autoComplete="off" />
        </section>

        <section className="flex flex-col gap-4" aria-label="Stay">
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Check-in" value={p.checkIn} max={today} onChange={(v) => set({ checkIn: v })} />
            <DateField label="Check-out" value={p.checkOut} max={today} onChange={(v) => set({ checkOut: v, paidOn: v <= today ? v : p.paidOn })} />
          </div>
          <p className="-mt-2 text-[14px] text-muted" aria-live="polite">
            {nights > 0 ? `${formatShortDay(p.checkIn)} to ${formatShortDay(p.checkOut)} · ${plural(nights, 'night')}` : 'Check-out must be after check-in.'}
          </p>
          {overlapping.length > 0 && (
            <p className="flex gap-2.5 rounded-2xl bg-haldi px-4 py-3 text-[15px] text-teak">
              <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-marigold" />
              <span>
                Already on these dates:{' '}
                {overlapping.map((s) => `${s.guest_name}, ${formatRange(s.check_in, s.check_out)} (${STATUS_LABEL[s.status]})`).join('; ')}. You can still save.
              </span>
            </p>
          )}
          <Group label="Guests">
            <Stepper label="Guests" value={p.guestsCount} min={1} max={20} onChange={(n) => set({ guestsCount: n })} />
          </Group>
        </section>

        <section className="flex flex-col gap-4" aria-label="Money">
          <MoneyField label="Total for the stay" hint="Final amount, after any discount" value={p.total} onChange={(v) => set({ total: v })} />
          <MoneyField label="They paid" hint="Leave empty if nothing was paid" value={p.paid} onChange={(v) => set({ paid: v })} />
          {p.paid !== null && p.paid > 0 && (
            <>
              <Group label="Paid by">
                <LabelledChips label="Paid by" options={MODES} labels={PAYMENT_MODE_LABEL} value={p.mode} onChange={(m) => set({ mode: m })} />
              </Group>
              <DateField label="Paid on" hint={formatShortDay(p.paidOn)} value={p.paidOn} max={today} onChange={(v) => set({ paidOn: v })} />
            </>
          )}
          <div aria-live="polite" className="min-h-[24px] text-[15px]">
            {after && (
              <p className={after.kind === 'paid' ? 'font-semibold text-peacock' : 'text-terracotta'}>
                {after.kind === 'paid' ? 'Paid in full.' : after.kind === 'due' ? `${formatRupees(after.amount)} still due (shows under To collect).` : `Overpaid by ${formatRupees(after.amount)}.`}
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-label="More">
          <Group label="Occasion" hint="Optional">
            <Chips label="Occasion" options={OCCASIONS} value={p.occasion as (typeof OCCASIONS)[number] | null} onChange={(v) => set({ occasion: v })} />
          </Group>
          <Group label="How they found us" hint="Optional · pick all that apply">
            <MultiChips label="How they found us" options={SOURCES} value={p.sources} onToggle={(v) => set({ sources: toggleSource(p.sources, v) })} />
          </Group>
          {hasReferral(p) && <ReferrerField draft={p} set={set} />}
          <TextField label="Notes" hint="Optional" value={p.notes} onChange={(v) => set({ notes: v })} />
        </section>

        {tried && error && (
          <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
            {error}
          </p>
        )}
        <SaveError error={create.error} />
        {!online && <OfflineNote />}
        <Button size="lg" block disabled={!online || create.isPending} onClick={save}>
          {create.isPending ? 'Saving…' : 'Save past stay'}
        </Button>
      </div>
    </Screen>
  );
}
