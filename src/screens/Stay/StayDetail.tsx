/**
 * Stay detail, shown as the bill. Every amount comes from the stay_totals row
 * or a single saved line; nothing is added up here.
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { StatusPill } from '@/components/StatusPill';
import { Toast, useToast } from '@/components/Toast';
import { useIdCheck, useRemoveIdCheck, useSetStatus, useSettings, useStayCharges, useStayPayments, useStays } from '@/data/hooks';
import type { ChargeRow, PaymentRow, StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { accommodationLabel, billFileName, billModel, billText, paymentLabel } from '@/lib/bill';
import { formatDayMonth, formatRange, istDate } from '@/lib/dates';
import { formatRupees, formatSigned } from '@/lib/format';
import { DOC_TYPE_LABEL, plural } from '@/lib/labels';
import { balanceState, type StayStatus } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { downloadFile, shareFile, shareText } from '@/lib/share';
import { cx } from '@/lib/cx';
import { ChargeSheet, PaymentSheet, VoidSheet, type VoidTarget } from './MoneySheets';
import { ConfirmMove, IdCheckSheet, StatusSheet } from './StaySheets';

type SheetName = 'payment' | 'charge' | 'status' | 'id' | null;

export function StayDetail() {
  const { stayId = '' } = useParams();
  const stays = useStays();
  const stay = stays.data?.find((s) => s.stay_id === stayId);

  if (stays.error) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Stay" />
        <ErrorState message={stays.error.message} onRetry={() => void stays.refetch()} />
      </Screen>
    );
  }
  if (stays.isPending) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Stay" />
        <div className="flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-16" />
        </div>
      </Screen>
    );
  }
  if (!stay) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Stay" />
        <ErrorState message="This stay isn’t here. It may have been opened from an old link." />
        <Link to="/stays" className="mx-[18px] mt-4 inline-flex min-h-touch items-center font-semibold text-peacock underline underline-offset-4">
          Go to Stays
        </Link>
      </Screen>
    );
  }
  return <StayBill stay={stay} />;
}

function StayBill({ stay }: { stay: StayRow }) {
  const today = useToday();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const payments = useStayPayments(stay.stay_id);
  const charges = useStayCharges(stay.stay_id);
  const idCheck = useIdCheck(stay.stay_id);
  const removeId = useRemoveIdCheck(stay.stay_id);
  const settings = useSettings();
  const setStatus = useSetStatus();
  const { toast, show, hide } = useToast();

  const [sheet, setSheet] = useState<SheetName>(null);
  const [voiding, setVoiding] = useState<VoidTarget | null>(null);
  const [confirming, setConfirming] = useState<StayStatus | null>(null);
  const savedBill = (location.state as { saved?: string } | null)?.saved;
  const [showSaved, setShowSaved] = useState(!!savedBill);
  const [makingPdf, setMakingPdf] = useState(false);

  // Fetch the PDF code while the owner reads the bill, so Share is quick
  // (the phone only allows sharing for a few seconds after the tap).
  useEffect(() => {
    void import('@/lib/billPdf');
  }, []);

  const messageLink = (kind: 'thank_you' | 'review_request') => `/stays/${stay.stay_id}/message?kind=${kind}`;

  const afterMove = (to: StayStatus) => {
    setConfirming(null);
    setSheet(null);
    if (to === 'checked_in') {
      show({ text: `${stay.guest_name.split(' ')[0]} checked in` });
      if (!idCheck.data) setSheet('id');
    } else if (to === 'completed') {
      show({ text: 'Checked out', action: { label: 'Send thank-you', onClick: () => navigate(messageLink('thank_you')) } });
    } else if (to === 'cancelled') {
      show({ text: 'Booking cancelled' });
    } else {
      show({ text: `Marked ${to === 'confirmed' ? 'confirmed' : to}` });
    }
  };

  // Cancelling, and checking out with money still due, ask first.
  const move = (to: StayStatus) => {
    if (to === 'cancelled' || (to === 'completed' && stay.balance > 0)) {
      setSheet(null);
      setConfirming(to);
      return;
    }
    setStatus.mutate(
      { stayId: stay.stay_id, status: to },
      { onSuccess: () => afterMove(to), onError: (e) => show({ text: e.message, tone: 'error' }) },
    );
  };

  // PDF to the share sheet; where files can't be shared, save the PDF;
  // if the PDF can't be made at all, share or copy the bill as text.
  const shareBill = async () => {
    if (!payments.data || !charges.data || !settings.data || makingPdf) return;
    const model = billModel(stay, charges.data, payments.data, settings.data, today);
    const title = `Bill ${stay.bill_no}`;
    setMakingPdf(true);
    try {
      const { billPdf } = await import('@/lib/billPdf');
      const file = new File([await billPdf(model)], billFileName(stay.bill_no), { type: 'application/pdf' });
      const r = await shareFile(file, title);
      if (r === 'unsupported') {
        downloadFile(file);
        show({ text: `Saved ${file.name}` });
      }
    } catch {
      const r = await shareText(title, billText(model));
      if (r === 'copied') show({ text: 'Bill copied as text. Paste it into WhatsApp.' });
      if (r === 'failed') show({ text: 'Couldn’t share or copy the bill.', tone: 'error' });
    } finally {
      setMakingPdf(false);
    }
  };

  const primary = primaryAction(stay.status);

  return (
    <Screen withNav={false}>
      <SubHeader
        title={stay.guest_name}
        subtitle={`${formatRange(stay.check_in, stay.check_out)} · ${plural(stay.nights, 'night')} · ${plural(stay.guests_count, 'guest')}`}
        right={
          <button
            type="button"
            onClick={() => setSheet('status')}
            className="mr-2 flex min-h-touch items-center gap-1 rounded-full"
            aria-label={`Status: ${stay.status.replace('_', ' ')}. Change status`}
          >
            <StatusPill status={stay.status} />
            <Icon name="chevron" size={16} className="rotate-90 text-muted" />
          </button>
        }
      />

      <AnimatePresence>
        {showSaved && savedBill && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-4"
          >
            <div role="status" className="mt-1 flex items-center justify-between gap-3 rounded-2xl bg-leaf/15 px-4 py-2 text-[15px] text-peacock">
              <span className="flex items-center gap-2">
                <Icon name="check" size={20} />
                Saved as <strong className="num">{savedBill}</strong>
              </span>
              <button type="button" onClick={() => setShowSaved(false)} className="grid h-12 w-12 place-items-center" aria-label="Dismiss">
                <Icon name="close" size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.section
        aria-label={`Bill ${stay.bill_no}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 mt-3 flex flex-col rounded-b-card rounded-t-md bg-white shadow-[0_12px_30px_-22px_rgba(43,29,20,0.45)]"
      >
        <div className="ticket-edge h-2.5" aria-hidden="true" />
        <div className="flex items-baseline justify-between px-[18px] pt-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
            Bill · <span className="num">{stay.bill_no}</span>
          </span>
          <span className="text-[13px] text-muted">{stay.pricing_mode === 'fixed' ? 'Fixed for stay' : `${formatRupees(stay.nightly_rate ?? 0)} a night`}</span>
        </div>

        <div className="flex flex-col gap-1 px-[18px] py-3 text-[15px]">
          <Row label={accommodationLabel(stay)} amount={formatRupees(stay.base)} />
          {charges.isPending ? (
            <Skeleton className="h-6" />
          ) : (
            charges.data?.map((c) => <ChargeLine key={c.id} c={c} onVoid={() => setVoiding({ kind: 'charge', row: c })} />)
          )}
        </div>

        <div className="mx-[18px] border-t-[1.5px] border-dashed border-line-strong" />
        <div className="flex items-baseline justify-between px-[18px] py-3">
          <span className="font-semibold">Total</span>
          <AnimatedAmount value={stay.final} className="text-[22px] font-bold" />
        </div>
        <div className="mx-[18px] border-t border-line" />

        <div className="flex flex-col gap-1 px-[18px] py-3 text-[15px]">
          <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Payments</span>
          {payments.isPending ? (
            <Skeleton className="h-10" />
          ) : payments.data && payments.data.length > 0 ? (
            payments.data.map((p) => <PaymentLine key={p.id} p={p} onVoid={() => setVoiding({ kind: 'payment', row: p })} />)
          ) : (
            <p className="py-1 text-[15px] text-muted">No payments yet.</p>
          )}
        </div>

        <BalanceBox stay={stay} />
      </motion.section>

      <IdCheckCard
        stayId={stay.stay_id}
        check={idCheck.data ?? null}
        loading={idCheck.isPending}
        onTick={() => setSheet('id')}
        onRemove={() => removeId.mutate(undefined, { onSuccess: () => show({ text: 'ID check removed' }) })}
        removing={removeId.isPending}
      />

      <div className="mx-4 mt-3 grid grid-cols-2 gap-2.5">
        <Button variant="outline" icon={<Icon name="rupee" size={20} />} onClick={() => setSheet('payment')} disabled={!online}>
          Add payment
        </Button>
        <Button variant="outline" icon={<Icon name="plus" size={20} />} onClick={() => setSheet('charge')} disabled={!online || stay.status === 'cancelled'}>
          Add charge
        </Button>
        <Button icon={<Icon name="share" size={20} />} onClick={() => void shareBill()}
          disabled={!payments.data || !charges.data || !settings.data || makingPdf}
          aria-busy={makingPdf}
        >
          {makingPdf ? 'Making PDF…' : 'Share bill'}
        </Button>
        {primary ? (
          <Button
            variant="secondary"
            disabled={primary.to ? !online || setStatus.isPending : false}
            onClick={() => (primary.to ? move(primary.to) : navigate(messageLink('review_request')))}
          >
            {primary.label}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setSheet('status')}>
            Change status
          </Button>
        )}
      </div>

      <div className={cx('mx-4 mt-2.5 grid gap-2.5', primary?.to || !primary ? 'grid-cols-2' : 'grid-cols-1')}>
        <Link to={messageLink('thank_you')} className="flex min-h-touch items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-peacock hover:bg-peacock/5">
          <Icon name="chat" size={20} />
          Message guest
        </Link>
        {/* On a completed stay "Ask for review" is already the main button. */}
        {(primary?.to || !primary) && (
          <Link to={messageLink('review_request')} className="flex min-h-touch items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-peacock hover:bg-peacock/5">
            <Icon name="star" size={20} />
            Ask for review
          </Link>
        )}
      </div>

      <Details stay={stay} />

      <PaymentSheet stay={stay} open={sheet === 'payment'} onClose={() => setSheet(null)} onSaved={(text) => show({ text })} />
      <ChargeSheet stay={stay} open={sheet === 'charge'} onClose={() => setSheet(null)} onSaved={(text) => show({ text })} />
      <VoidSheet target={voiding} onClose={() => setVoiding(null)} onSaved={(text) => show({ text })} />
      <StatusSheet stay={stay} open={sheet === 'status'} onClose={() => setSheet(null)} onPick={move} />
      <IdCheckSheet stayId={stay.stay_id} open={sheet === 'id'} onClose={() => setSheet(null)} onSaved={() => show({ text: 'ID checked' })} />
      <ConfirmMove
        stay={stay}
        to={confirming}
        onClose={() => setConfirming(null)}
        onDone={afterMove}
        onAddPayment={() => {
          setConfirming(null);
          setSheet('payment');
        }}
      />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function primaryAction(status: StayStatus): { label: string; to?: StayStatus } | null {
  switch (status) {
    case 'enquiry':
    case 'tentative':
      return { label: 'Confirm', to: 'confirmed' };
    case 'confirmed':
      return { label: 'Check in', to: 'checked_in' };
    case 'checked_in':
      return { label: 'Check out', to: 'completed' };
    case 'completed':
      return { label: 'Ask for review' };
    default:
      return null;
  }
}

function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  return (
    <motion.span key={value} initial={{ opacity: 0.3, y: -6 }} animate={{ opacity: 1, y: 0 }} className={cx('num', className)}>
      {formatRupees(value)}
    </motion.span>
  );
}

function Row({ label, amount, className }: { label: ReactNode; amount: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-[32px] items-center justify-between gap-3', className)}>
      <span>{label}</span>
      <span className="num shrink-0 font-semibold">{amount}</span>
    </div>
  );
}

/** A line that can be voided: tapping it opens the void sheet. Voided lines are struck through. */
function VoidableLine({ voided, onVoid, label, sub, amount, amountClass, voidLabel }: {
  voided: boolean;
  onVoid: () => void;
  label: string;
  sub?: string;
  amount: string;
  amountClass?: string;
  voidLabel: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col text-left">
        <span className={cx('font-semibold', voided && 'line-through')}>{label}</span>
        {sub && <span className="text-[13px] text-muted">{sub}</span>}
      </span>
      <span className={cx('num shrink-0 font-semibold', voided ? 'line-through' : amountClass)}>{amount}</span>
    </>
  );
  if (voided) {
    return <div className="flex min-h-touch items-center justify-between gap-3 text-muted">{body}</div>;
  }
  return (
    <button type="button" onClick={onVoid} aria-label={voidLabel} className="-mx-2 flex min-h-touch items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-haldi/60">
      {body}
    </button>
  );
}

function ChargeLine({ c, onVoid }: { c: ChargeRow; onVoid: () => void }) {
  const discount = c.kind === 'discount';
  return (
    <VoidableLine
      voided={c.voided}
      onVoid={onVoid}
      label={discount ? `${c.label} discount` : c.label}
      sub={c.voided ? `Voided · ${c.void_reason ?? ''}` : undefined}
      amount={formatSigned(c.amount, discount ? '−' : '+')}
      amountClass={discount ? 'text-peacock' : undefined}
      voidLabel={`${c.label} ${formatRupees(c.amount)}. Void this line`}
    />
  );
}

function PaymentLine({ p, onVoid }: { p: PaymentRow; onVoid: () => void }) {
  const sub = p.voided ? `Voided · ${p.void_reason ?? ''}` : [formatDayMonth(p.paid_on), p.reference, p.created_by.split(' ')[0]].filter(Boolean).join(' · ');
  return (
    <VoidableLine
      voided={p.voided}
      onVoid={onVoid}
      label={paymentLabel(p)}
      sub={sub}
      amount={p.type === 'refund' ? formatSigned(p.amount, '−') : formatRupees(p.amount)}
      amountClass={p.type === 'refund' ? 'text-terracotta' : undefined}
      voidLabel={`${paymentLabel(p)}, ${formatRupees(p.amount)} on ${formatDayMonth(p.paid_on)}. Void this payment`}
    />
  );
}

function BalanceBox({ stay }: { stay: StayRow }) {
  const b = balanceState(stay.balance);
  const paidOf = `Paid ${formatRupees(stay.net_paid)} of ${formatRupees(stay.final)}`;
  if (stay.status === 'cancelled') {
    return (
      <div className="mx-3 mb-3 mt-1 flex items-center justify-between rounded-2xl bg-line/60 px-3.5 py-3" aria-live="polite">
        <span className="flex flex-col">
          <span className="text-[14px] font-semibold text-muted">Cancelled</span>
          <span className="text-[13px] text-muted">Nothing more is due</span>
        </span>
        <span className="num text-[18px] font-semibold text-muted">{formatRupees(stay.net_paid)} kept</span>
      </div>
    );
  }
  return (
    <div
      aria-live="polite"
      className={cx(
        'mx-3 mb-3 mt-1 flex items-center justify-between rounded-2xl px-3.5 py-3',
        b.kind === 'paid' ? 'bg-leaf/15' : 'bg-terracotta-50',
      )}
    >
      <span className="flex flex-col">
        <span className={cx('text-[14px] font-semibold', b.kind === 'paid' ? 'text-peacock' : 'text-terracotta')}>
          {b.kind === 'due' ? 'Balance due' : b.kind === 'paid' ? 'Paid in full' : 'Overpaid'}
        </span>
        <span className="text-[13px] text-muted">{paidOf}</span>
      </span>
      <AnimatedAmount
        value={b.kind === 'paid' ? stay.final : b.amount}
        className={cx('text-[26px] font-bold', b.kind === 'paid' ? 'text-peacock' : 'text-terracotta')}
      />
      {b.kind === 'overpaid' && <span className="sr-only">Overpaid by {formatRupees(b.amount)}</span>}
    </div>
  );
}

function IdCheckCard({
  check,
  loading,
  onTick,
  onRemove,
  removing,
}: {
  stayId: string;
  check: { doc_type: keyof typeof DOC_TYPE_LABEL; last4: string | null; checked_by: string; checked_at: string } | null;
  loading: boolean;
  onTick: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  if (loading) return <Skeleton className="mx-4 mt-3 h-[68px]" />;
  if (!check) {
    return (
      <button
        type="button"
        onClick={onTick}
        className="mx-4 mt-3 flex min-h-[64px] items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-white px-3.5 py-3 text-left hover:bg-haldi/60"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-haldi text-marigold">
          <Icon name="idcard" />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold">ID not yet checked</span>
          <span className="text-[13px] text-muted">Tap when you’ve seen an ID</span>
        </span>
        <Icon name="chevron" size={20} className="text-muted" />
      </button>
    );
  }
  const when = formatDayMonth(istDate(check.checked_at));
  return (
    <div className="mx-4 mt-3 flex min-h-[64px] items-center gap-3 rounded-2xl bg-white px-3.5 py-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-peacock text-white">
        <Icon name="check" size={20} />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-[15px] font-semibold">
          ID checked · {DOC_TYPE_LABEL[check.doc_type]}
          {check.last4 && <span className="num"> ····{check.last4}</span>}
        </span>
        <span className="text-[13px] text-muted">
          By {check.checked_by}, {when}
        </span>
      </span>
      <button type="button" onClick={onRemove} disabled={removing} className="min-h-touch px-2 text-[14px] font-semibold text-muted underline underline-offset-4">
        Undo
      </button>
    </div>
  );
}

function Details({ stay }: { stay: StayRow }) {
  const items: [string, ReactNode][] = [
    ['Phone', <a key="p" href={`tel:${stay.guest_phone}`} className="num font-semibold text-peacock underline-offset-4 hover:underline">{formatPhone(stay.guest_phone)}</a>],
    ['Occasion', stay.occasion ?? '—'],
    ['Came via', stay.sources.length > 0 ? stay.sources.join(', ') : '—'],
    ...(stay.referrer_name ? [['Referred by', stay.referrer_name] as [string, string]] : []),
    ['Booked by', `${stay.created_by}, ${formatDayMonth(istDate(stay.created_at))}`],
  ];
  return (
    <section aria-label="Booking details" className="mx-4 mb-6 mt-4 rounded-card border border-line bg-white px-4 py-2">
      <dl className="divide-y divide-line text-[15px]">
        {items.map(([k, v]) => (
          <div key={k} className="flex min-h-touch items-center justify-between gap-3 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
        {stay.notes && (
          <div className="py-3">
            <dt className="text-muted">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{stay.notes}</dd>
          </div>
        )}
      </dl>
      <Link to={`/guests/${stay.guest_id}`} className="flex min-h-touch items-center justify-between border-t border-line font-semibold text-peacock">
        Guest’s past stays
        <Icon name="chevron" size={20} />
      </Link>
    </section>
  );
}
