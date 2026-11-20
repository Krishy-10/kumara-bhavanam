/**
 * Pipeline: every open booking from first enquiry to confirmed, soonest
 * arrival first, with what needs doing and one-tap moves to the next stage.
 */
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { StatusPill } from '@/components/StatusPill';
import { Toast, useToast } from '@/components/Toast';
import { firstName } from '@/config/users';
import { useSetStatus, useStays } from '@/data/hooks';
import type { StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { plural } from '@/lib/labels';
import { sumRupees, type StayStatus } from '@/lib/money';
import { waNumber } from '@/lib/phone';
import { daysSinceEntered, PIPELINE_STAGES, pipelineNotes, pipelineStages, STAGE_TITLE, type PipelineNote, type PipelineStage } from '@/lib/pipeline';
import { cx } from '@/lib/cx';
import { ConfirmMove } from '@/screens/Stay/StaySheets';

const EMPTY: Record<PipelineStage, string> = {
  enquiry: 'No open enquiries. Save a booking as “Enquiry” and it shows here.',
  tentative: 'Nothing on hold.',
  confirmed: 'No confirmed arrivals ahead.',
};

export function Pipeline() {
  const today = useToday();
  const stays = useStays();
  const setStatus = useSetStatus();
  const online = useOnline();
  const { toast, show, hide } = useToast();
  const [cancelling, setCancelling] = useState<StayRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const move = (s: StayRow, to: StayStatus) => {
    if (to === 'cancelled') {
      setCancelling(s);
      return;
    }
    const from = s.status;
    setBusy(s.stay_id);
    setStatus.mutate(
      { stayId: s.stay_id, status: to },
      {
        onSettled: () => setBusy(null),
        onSuccess: () =>
          show({
            text: `${firstName(s.guest_name)}: ${to === 'confirmed' ? 'confirmed' : to === 'tentative' ? 'dates on hold' : 'back to enquiry'}`,
            action: { label: 'Undo', onClick: () => setStatus.mutate({ stayId: s.stay_id, status: from }, { onError: (e) => show({ text: e.message, tone: 'error' }) }) },
          }),
        onError: (e) => show({ text: e.message, tone: 'error' }),
      },
    );
  };

  const all = stays.data ?? [];
  const groups = pipelineStages(all);

  return (
    <Screen>
      <SubHeader title="Pipeline" subtitle="From enquiry to arrival" />

      {stays.error ? (
        <ErrorState message={stays.error.message} onRetry={() => void stays.refetch()} />
      ) : !stays.data ? (
        <div className="flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[84px]" />
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-[160px]" />
        </div>
      ) : (
        <>
          <nav aria-label="Stages" className="grid grid-cols-3 gap-2 px-4">
            {PIPELINE_STAGES.map((stage) => (
              <a
                key={stage}
                href={`#stage-${stage}`}
                className="flex min-h-[84px] flex-col justify-center gap-0.5 rounded-card border border-line bg-white px-3 py-2"
              >
                <span className="text-[13px] leading-tight text-muted">{stage === 'confirmed' ? 'Confirmed' : STAGE_TITLE[stage]}</span>
                <span className="num text-[24px] font-bold leading-tight">{groups[stage].length}</span>
                <span className="num truncate text-[13px] text-muted">{formatRupees(sumRupees(groups[stage].map((s) => s.final)))}</span>
              </a>
            ))}
          </nav>

          <LayoutGroup>
            {PIPELINE_STAGES.map((stage) => (
              <section key={stage} id={`stage-${stage}`} aria-labelledby={`h-${stage}`} className="mt-6 scroll-mt-4 px-4">
                <h2 id={`h-${stage}`} className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{STAGE_TITLE[stage]}</span>
                  <span className="num text-[13px] text-muted">{groups[stage].length}</span>
                </h2>
                <ul className="flex flex-col gap-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {groups[stage].map((s) => (
                      <motion.li
                        key={s.stay_id}
                        layout
                        layoutId={s.stay_id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                      >
                        <PipelineCard stay={s} notes={pipelineNotes(s, all, today)} today={today} busy={busy === s.stay_id} online={online} onMove={(to) => move(s, to)} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                {groups[stage].length === 0 && (
                  <p className="rounded-card border border-dashed border-line-strong bg-white p-4 text-center text-[15px] text-muted">{EMPTY[stage]}</p>
                )}
              </section>
            ))}
          </LayoutGroup>
          <div className="h-4" />
        </>
      )}

      {cancelling && (
        <ConfirmMove
          stay={cancelling}
          to="cancelled"
          onClose={() => setCancelling(null)}
          onAddPayment={() => setCancelling(null)}
          onDone={() => {
            show({ text: `${firstName(cancelling.guest_name)}: cancelled` });
            setCancelling(null);
          }}
        />
      )}
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function PipelineCard({
  stay,
  notes,
  today,
  busy,
  online,
  onMove,
}: {
  stay: StayRow;
  notes: PipelineNote[];
  today: string;
  busy: boolean;
  online: boolean;
  onMove: (to: StayStatus) => void;
}) {
  const passed = notes.some((n) => n.kind === 'passed');
  const taken = notes.some((n) => n.kind === 'taken');
  const entered = daysSinceEntered(stay.created_at, today);
  const year = stay.check_in.slice(0, 4) !== today.slice(0, 4) ? ` ${stay.check_in.slice(0, 4)}` : '';

  return (
    <div className={cx('rounded-card border bg-white p-4', notes.some((n) => n.urgent) ? 'border-terracotta-100' : 'border-line')}>
      <Link to={`/stays/${stay.stay_id}`} className="-m-1 flex items-start justify-between gap-3 rounded-2xl p-1">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[17px] font-semibold">{stay.guest_name}</span>
          <span className="text-[14px] text-muted">
            {formatRange(stay.check_in, stay.check_out)}
            {year} · {plural(stay.nights, 'night')} · {plural(stay.guests_count, 'guest')}
          </span>
          <span className="text-[13px] text-muted">
            Entered {entered <= 0 ? 'today' : entered === 1 ? 'yesterday' : `${entered} days ago`}
            {stay.occasion ? ` · ${stay.occasion}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-[16px] font-semibold">{formatRupees(stay.final)}</span>
          {stay.status === 'confirmed' ? (
            <span className="num text-[13px] text-muted">{stay.net_paid > 0 ? `${formatRupees(stay.net_paid)} paid` : 'No advance'}</span>
          ) : (
            <StatusPill status={stay.status} />
          )}
        </span>
      </Link>

      {notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n.kind} className={cx('flex items-start gap-2 rounded-xl px-3 py-2 text-[14px]', n.urgent ? 'bg-terracotta-50 text-terracotta' : 'bg-haldi text-teak')}>
              <Icon name="alert" size={18} className={cx('mt-0.5 shrink-0', !n.urgent && 'text-marigold')} />
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <a
          href={`tel:${stay.guest_phone}`}
          aria-label={`Call ${stay.guest_name}`}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line text-peacock hover:bg-haldi"
        >
          <Icon name="phone" size={20} />
        </a>
        <a
          href={`https://wa.me/${waNumber(stay.guest_phone)}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`WhatsApp ${stay.guest_name}`}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line text-peacock hover:bg-haldi"
        >
          <Icon name="chat" size={20} />
        </a>
        <div className="flex flex-1 justify-end gap-2">
          {passed ? (
            <Button variant="danger" disabled={!online || busy} onClick={() => onMove('cancelled')}>
              Cancel
            </Button>
          ) : stay.status === 'enquiry' ? (
            <>
              <Button variant="outline" className="px-4" disabled={!online || busy} onClick={() => onMove('tentative')}>
                Hold dates
              </Button>
              <Button className="px-4" disabled={!online || busy || taken} onClick={() => onMove('confirmed')}>
                Confirm
              </Button>
            </>
          ) : stay.status === 'tentative' ? (
            <Button disabled={!online || busy || taken} onClick={() => onMove('confirmed')}>
              Confirm
            </Button>
          ) : (
            <Link to={`/stays/${stay.stay_id}`} className="inline-flex min-h-touch items-center gap-1 rounded-2xl px-3 text-[15px] font-semibold text-peacock">
              Open <Icon name="chevron" size={18} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** "2 enquiries · 1 on hold", linking to the Pipeline. Hidden when nothing is open. */
export function PipelineLink({ stays, className }: { stays: StayRow[]; className?: string }) {
  const g = pipelineStages(stays);
  const parts = [g.enquiry.length && plural(g.enquiry.length, 'enquiry', 'enquiries'), g.tentative.length && `${g.tentative.length} on hold`].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <Link
      to="/pipeline"
      className={cx('flex min-h-[60px] items-center gap-3 rounded-card border border-line bg-white px-4 py-3 transition-transform active:scale-[0.99]', className)}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-haldi text-teak" aria-hidden="true">
        <Icon name="swap" size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] text-muted">Pipeline</span>
        <span className="truncate text-[16px] font-semibold">{parts.join(' · ')}</span>
      </span>
      <Icon name="chevron" size={20} className="text-muted" />
    </Link>
  );
}
