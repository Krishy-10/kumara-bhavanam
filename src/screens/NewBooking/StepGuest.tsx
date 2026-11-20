import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Group, Segmented, TextField, Toggle } from '@/components/Controls';
import { useGuestByPhone, useStays } from '@/data/hooks';
import { formatDayMonth, formatRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { STATUS_LABEL, plural } from '@/lib/labels';
import { totalSpent } from '@/lib/money';
import { looksLikeIndianMobile, normalizePhone } from '@/lib/phone';
import { useToday } from '@/hooks/useToday';
import { toggleSource, type Draft } from './draft';

const RETURNING = 'Returning guest';

export function StepGuest({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const today = useToday();
  const phone = normalizePhone(draft.phone);
  const lookup = useGuestByPhone(phone);
  const stays = useStays();
  const guest = lookup.data ?? null;
  const allStays = guest ? (stays.data ?? []).filter((s) => s.guest_id === guest.id) : [];
  const pastStays = allStays.filter((s) => s.status !== 'cancelled' && s.check_in < today);
  const upcoming = allStays
    .filter((s) => s.check_in >= today && s.status !== 'cancelled')
    .sort((a, b) => (a.check_in < b.check_in ? -1 : 1))[0];
  const lastStay = [...pastStays].sort((a, b) => (a.check_in < b.check_in ? 1 : -1))[0];
  const spent = totalSpent(allStays);
  const oddIndian = phone !== null && phone.startsWith('+91') && !looksLikeIndianMobile(phone);

  // A known number fills the guest in, once per guest, without undoing edits.
  // If the number then changes, the filled-in details are cleared, so one
  // guest's name can never be saved against another person's number.
  useEffect(() => {
    if (!guest && draft.filledFrom && (phone === null || lookup.isSuccess)) {
      set({
        filledFrom: null,
        name: '',
        city: '',
        email: '',
        language: 'en',
        foreign: false,
        nationality: '',
        sources: draft.sources.filter((x) => x !== RETURNING),
      });
    } else if (guest && draft.filledFrom !== guest.id) {
      set({
        filledFrom: guest.id,
        name: guest.name,
        city: guest.city ?? '',
        email: guest.email ?? '',
        language: guest.language,
        foreign: guest.nationality !== 'Indian',
        nationality: guest.nationality !== 'Indian' ? guest.nationality : '',
        sources: draft.sources.includes(RETURNING) ? draft.sources : toggleSource(draft.sources, RETURNING),
      });
    }
  }, [guest, phone, lookup.isSuccess, draft.filledFrom, draft.sources, set]);

  const showDetails = phone !== null && !lookup.isPending;

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Phone number"
        hint="Searches past guests"
        value={draft.phone}
        onChange={(v) => set({ phone: v })}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        autoFocus
        placeholder="98431 12345"
        error={draft.phone.replace(/\D/g, '').length >= 10 && !phone ? 'That doesn’t look like a phone number.' : null}
      />

      {/* Only one of these shows at a time; each fades in with CSS and
          nothing waits on the previous one to animate out. */}
        {phone && lookup.isPending && (
          <p key="looking" className="fade-in -mt-2 text-[14px] text-muted" role="status">
            Looking up this number…
          </p>
        )}
        {showDetails && guest && (
          <div
            key="found"
            role="status"
            className="screen-in -mt-1 flex items-center gap-3 rounded-card border border-peacock/20 bg-peacock/5 p-4"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peacock text-[13px] font-bold text-white">✓</span>
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">
                {pastStays.length > 0 ? `Returning guest · ${plural(pastStays.length, 'past stay')}` : 'Known guest'}
              </span>
              <span className="text-[14px] text-muted">
                {lastStay && `Last: ${formatDayMonth(lastStay.check_in)} ${lastStay.check_in.slice(0, 4)}${lastStay.occasion ? ` · ${lastStay.occasion}` : ''} · `}
                spent {formatRupees(spent)}
              </span>
              {upcoming && (
                <span className="text-[14px] font-medium text-peacock">
                  Already booked {formatRange(upcoming.check_in, upcoming.check_out)} ({STATUS_LABEL[upcoming.status]})
                </span>
              )}
            </span>
          </div>
        )}
        {showDetails && !guest && !lookup.error && (
          <p key="new" className="fade-in -mt-2 text-[14px] text-muted" role="status">
            New guest.{oddIndian && ' Check the number: Indian mobiles start with 6, 7, 8 or 9.'}
          </p>
        )}

      {lookup.error && <p className="text-[14px] text-terracotta">{lookup.error.message}</p>}

      <TextField label="Name" value={draft.name} onChange={(v) => set({ name: v })} autoComplete="off" autoCapitalize="words" placeholder="Guest’s name" />
      <TextField label="City" hint="Optional" value={draft.city} onChange={(v) => set({ city: v })} autoComplete="off" autoCapitalize="words" placeholder="Where they’re coming from" />

      <Group label="Messages in">
        <Segmented
          label="Language for messages"
          name="lang"
          value={draft.language}
          onChange={(v) => set({ language: v })}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ta', label: 'தமிழ்' },
          ]}
        />
      </Group>

      <div className="rounded-card border border-line bg-white px-4 py-1">
        <Toggle label="Foreign guest" hint="Not an Indian citizen" checked={draft.foreign} onChange={(v) => set({ foreign: v })} />
        <AnimatePresence initial={false}>
          {draft.foreign && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <TextField label="Nationality" value={draft.nationality} onChange={(v) => set({ nationality: v })} className="pb-3 pt-1" placeholder="e.g. British" />
              <p className="mb-3 rounded-2xl bg-haldi p-3 text-[14px] text-teak">
                Reminder: Form C must be filed with the police within 24 hours of arrival.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
