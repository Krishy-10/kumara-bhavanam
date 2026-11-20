import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Screen, SubHeader } from '@/components/Layout';
import { useBlockedDates, useCreateBooking, useGuestByPhone, useStays } from '@/data/hooks';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatRupees } from '@/lib/format';
import { cx } from '@/lib/cx';
import { dueAfterAdvance, totalBreakdown } from '@/lib/money';
import { findConflicts } from '@/lib/occupancy';
import { normalizePhone } from '@/lib/phone';
import { readSession, writeSession } from '@/lib/storage';
import { useCurrentUser } from '@/session/UserContext';
import { checkOutOf, draftPricing, draftTotals, guestStepError, lastNightlyRate, newDraft, priceStepError, restoreDraft, stayStepError, toPayload, type Draft } from './draft';
import { StepGuest } from './StepGuest';
import { StepPrice } from './StepPrice';
import { StepStay } from './StepStay';

const DRAFT_KEY = 'kb.newBooking';
const STEPS = ['Guest', 'Stay', 'Price'] as const;
const SAVE_LABEL = { enquiry: 'Save enquiry', tentative: 'Save tentative booking', confirmed: 'Confirm booking' } as const;

export function NewBooking() {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stays = useStays();
  const blocked = useBlockedDates();
  const create = useCreateBooking();

  // The draft survives a reload or the Android back button within this tab.
  // Opening from the calendar or a guest page starts a fresh draft with that date or phone.
  const location = useLocation();
  const start = location.state as { checkIn?: string; phone?: string } | null;
  const [draft, setDraft] = useState<Draft>(() =>
    start?.checkIn || start?.phone
      ? { ...newDraft(today), checkIn: start.checkIn ?? today, phone: start.phone ?? '' }
      : restoreDraft(readSession<unknown>(DRAFT_KEY), today),
  );
  // Drop that start state so a reload keeps the typed draft instead.
  useEffect(() => {
    if (start) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [start, navigate, location.pathname, location.search]);
  const set = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);
  useEffect(() => writeSession(DRAFT_KEY, draft), [draft]);

  // Default rate: the last per-night rate used, until the owner types one.
  useEffect(() => {
    if (!draft.rateTouched && draft.nightlyRate === null && stays.data) set({ nightlyRate: lastNightlyRate(stays.data) });
  }, [stays.data, draft.rateTouched, draft.nightlyRate, set]);

  const guestError = guestStepError(draft);
  const requested = Number(params.get('step') ?? '1');
  // Never land on a later step with an unfinished earlier one (e.g. after a reload).
  const step = guestError ? 1 : Math.min(3, Math.max(1, requested));

  const conflicts = useMemo(
    () => findConflicts(stays.data ?? [], blocked.data ?? [], draft.checkIn, checkOutOf(draft)),
    [stays.data, blocked.data, draft],
  );
  const hardConflict = conflicts.hard.length > 0;
  const stayError = stayStepError(draft);
  const returning = !!useGuestByPhone(normalizePhone(draft.phone)).data;

  // Arriving on step 2 or 3 with no draft means Back was pressed after a save
  // (the draft is cleared on save): go Home rather than show an empty form.
  useEffect(() => {
    if (requested > 1 && guestError && draft.phone === '' && draft.name === '') navigate('/', { replace: true });
  }, [requested, guestError, draft.phone, draft.name, navigate]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [step]);

  const goTo = (n: number) => setParams({ step: String(n) });
  const leave = () => {
    writeSession(DRAFT_KEY, null);
    navigate('/', { replace: true });
  };

  const save = () => {
    create.mutate(toPayload(draft, user), {
      onSuccess: (r) => {
        // The screen unmounts on navigate; the next visit starts from a fresh draft.
        writeSession(DRAFT_KEY, null);
        navigate(`/stays/${r.stay_id}`, { replace: true, state: { saved: r.bill_no } });
      },
    });
  };

  const totals = draftTotals(draft);
  const due = dueAfterAdvance(totals.final, draft.advance ?? 0);
  const priceError = priceStepError(draft);
  const stepTitle = ['Who is the guest?', 'When and how many?', 'Price and advance'][step - 1];

  return (
    <Screen withNav={false}>
      <SubHeader title="New booking" onBack={step === 1 ? leave : () => navigate(-1)} />

      <div className="px-[22px]">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <motion.span className="block h-full rounded-full bg-peacock" initial={false} animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.35 }} />
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[13px] text-muted">
          {STEPS.map((s, i) => (
            <span key={s} className={cx(i + 1 === step && 'font-semibold text-peacock')}>
              {s}
              {i + 1 < step && ' ✓'}
            </span>
          ))}
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-[22px] font-bold outline-none">
          <span className="sr-only">Step {step} of 3: </span>
          {stepTitle}
        </h2>
      </div>

      <div className="relative flex-1 overflow-x-hidden px-[18px] pb-6 pt-4">
        {/* The new step shows at once and slides in with CSS; nothing waits
            for the old step to animate out, so quick taps can't leave a gap. */}
        <div key={step} className="step-in">
          {step === 1 && <StepGuest draft={draft} set={set} />}
          {step === 2 && <StepStay draft={draft} set={set} conflicts={conflicts} checking={stays.isPending || blocked.isPending} />}
          {step === 3 && <StepPrice draft={draft} set={set} returning={returning} />}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 pb-safe">
        {step < 3 ? (
          <div className="border-t border-line bg-jasmine px-[18px] pt-3">
            {step === 2 && (hardConflict || stayError) && (
              <p className="mb-2 text-center text-[14px] text-terracotta">{hardConflict ? 'These dates are taken. Change the dates to continue.' : stayError}</p>
            )}
            <Button size="lg" block disabled={step === 1 ? !!guestError : hardConflict || !!stayError || stays.isPending} onClick={() => goTo(step + 1)}>
              Next
            </Button>
          </div>
        ) : (
          <div className="mx-2.5 rounded-t-hero bg-teak px-5 pb-1 pt-4 text-white shadow-[0_-12px_30px_-18px_rgba(43,29,20,0.6)]">
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-white/70">Total · {totalBreakdown(draftPricing(draft), totals, formatRupees)}</span>
                <motion.span key={totals.final} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="num text-[24px] font-bold">
                  {formatRupees(totals.final)}
                </motion.span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-white/70">{draft.checkIn <= today ? 'Balance to collect' : 'Due on arrival'}</span>
                <span className={cx('num text-[18px] font-semibold', due < 0 ? 'text-terracotta-100' : 'text-marigold')}>
                  {due < 0 ? `Advance is ${formatRupees(-due)} over` : formatRupees(due)}
                </span>
              </div>
            </div>
            {(priceError || create.error || !online) && (
              <p role="alert" className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-[14px] text-terracotta-100">
                {!online ? 'You’re offline. Saving is off until you reconnect.' : (create.error?.message ?? priceError)}
              </p>
            )}
            <Button
              size="lg"
              block
              variant="secondary"
              className="mt-3"
              disabled={!!priceError || !online || create.isPending || hardConflict}
              onClick={save}
            >
              {create.isPending ? 'Saving…' : SAVE_LABEL[draft.status]}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}
