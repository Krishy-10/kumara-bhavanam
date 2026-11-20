/**
 * Add payment, Add charge and Void sheets for the stay bill. Payments and
 * charges are never edited or deleted: a mistake is voided with a reason.
 */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Chips, DateField, Group, LabelledChips, MoneyField, Segmented, TextField } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useAddCharge, useAddPayment, useVoidCharge, useVoidCommission, useVoidCommissionPayout, useVoidExpense, useVoidPayment } from '@/data/hooks';
import type { ChargeRow, CommissionPayoutRow, CommissionRow, ExpenseRow, PaymentMode, PaymentRow, StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatDayMonth, formatShortDay } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { DISCOUNT_LABELS, EXTRA_LABELS, PAYMENT_MODE_LABEL, VOID_REASONS } from '@/lib/labels';
import { balanceAfter, balanceState, type ChargeKind, type PaymentType } from '@/lib/money';
import { paymentLabel } from '@/lib/bill';
import { useCurrentUser } from '@/session/UserContext';

export const MODES: readonly PaymentMode[] = ['upi', 'cash', 'bank_transfer', 'card', 'other'];

export function SaveError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
      {error.message}
    </p>
  );
}

export function OfflineNote() {
  return <p className="text-center text-[14px] text-muted">You’re offline. Saving is off until you reconnect.</p>;
}

// ---- Add payment ------------------------------------------------------------

export function PaymentSheet({ stay, open, onClose, onSaved }: { stay: StayRow; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add payment">
      {/* Remount each time it opens, so the form starts fresh. */}
      {open && <PaymentForm stay={stay} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function PaymentForm({ stay, onClose, onSaved }: { stay: StayRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddPayment();
  const owed = stay.status !== 'cancelled' && stay.balance > 0;
  // Before arrival money is an advance; after, it's a payment and defaults to the balance.
  const beforeArrival = stay.status === 'enquiry' || stay.status === 'tentative' || stay.status === 'confirmed';
  const [type, setType] = useState<PaymentType>(beforeArrival ? 'advance' : 'payment');
  const [amount, setAmount] = useState<number | null>(owed && !beforeArrival ? stay.balance : null);
  const [mode, setMode] = useState<PaymentMode>('upi');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');

  const after = amount && amount > 0 ? balanceState(balanceAfter(stay.balance, type, amount)) : null;
  const valid = amount !== null && amount > 0 && paidOn <= today;

  const save = () => {
    if (!valid) return;
    add.mutate(
      { stay_id: stay.stay_id, amount: amount!, type, mode, paid_on: paidOn, reference: reference.trim() || null, created_by: user },
      {
        onSuccess: () => {
          onSaved(`${type === 'refund' ? 'Refund' : type === 'advance' ? 'Advance' : 'Payment'} of ${formatRupees(amount!)} saved`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Segmented<PaymentType>
        label="Kind of payment"
        name="pay-type"
        value={type}
        onChange={setType}
        options={[
          { value: 'payment', label: 'Payment' },
          { value: 'advance', label: 'Advance' },
          { value: 'refund', label: 'Refund' },
        ]}
      />
      <MoneyField
        label={type === 'refund' ? 'Amount paid back' : 'Amount received'}
        hint={owed ? `Balance ${formatRupees(stay.balance)}` : undefined}
        value={amount}
        onChange={setAmount}
      />
      <Group label="Paid by">
        <LabelledChips label="Paid by" options={MODES} labels={PAYMENT_MODE_LABEL} value={mode} onChange={setMode} />
      </Group>
      <DateField label={type === 'refund' ? 'Paid out on' : 'Received on'} hint={formatShortDay(paidOn)} value={paidOn} max={today} onChange={setPaidOn} />
      <TextField label="Reference" hint="Optional: UPI ref, cheque no." value={reference} onChange={setReference} autoComplete="off" />

      <div aria-live="polite" className="min-h-[24px] text-[15px]">
        {after && stay.status !== 'cancelled' && (
          <p className={after.kind === 'paid' ? 'font-semibold text-peacock' : 'text-terracotta'}>
            {after.kind === 'paid' ? 'This settles the bill.' : after.kind === 'due' ? `${formatRupees(after.amount)} will still be due.` : `Overpaid by ${formatRupees(after.amount)}.`}
          </p>
        )}
      </div>

      <SaveError error={add.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!valid || !online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : type === 'refund' ? 'Save refund' : 'Save payment'}
      </Button>
    </div>
  );
}

// ---- Add charge or discount -------------------------------------------------

export function ChargeSheet({ stay, open, onClose, onSaved }: { stay: StayRow; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add extra or discount">
      {open && <ChargeForm stay={stay} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function ChargeForm({ stay, onClose, onSaved }: { stay: StayRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddCharge();
  const [kind, setKind] = useState<ChargeKind>('charge');
  const [pick, setPick] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [amount, setAmount] = useState<number | null>(null);

  // Discounts must use the fixed list (a database rule); extras can be named.
  const label = kind === 'charge' && pick === 'Other' ? custom.trim() : pick;
  const valid = !!label && amount !== null && amount > 0;

  const save = () => {
    if (!valid) return;
    add.mutate(
      { stay_id: stay.stay_id, kind, label: label!, amount: amount!, created_by: user },
      {
        onSuccess: () => {
          onSaved(`${kind === 'charge' ? 'Extra' : 'Discount'} added: ${label} ${formatRupees(amount!)}`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Segmented<ChargeKind>
        label="Extra or discount"
        name="charge-kind"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setPick(null);
        }}
        options={[
          { value: 'charge', label: '+ Extra' },
          { value: 'discount', label: '− Discount' },
        ]}
      />
      <Group label={kind === 'charge' ? 'What for' : 'Reason'}>
        <Chips label={kind === 'charge' ? 'Extra' : 'Discount reason'} options={kind === 'charge' ? EXTRA_LABELS : DISCOUNT_LABELS} value={pick} onChange={setPick} />
      </Group>
      {kind === 'charge' && pick === 'Other' && <TextField label="Name of the extra" value={custom} onChange={setCustom} placeholder="e.g. Extra breakfast" />}
      <MoneyField label="Amount" value={amount} onChange={setAmount} />
      <SaveError error={add.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!valid || !online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : kind === 'charge' ? 'Add extra' : 'Add discount'}
      </Button>
    </div>
  );
}

// ---- Void a payment or a charge ---------------------------------------------

export type VoidTarget =
  | { kind: 'payment'; row: PaymentRow }
  | { kind: 'charge'; row: ChargeRow }
  | { kind: 'commission'; row: CommissionRow }
  | { kind: 'payout'; row: CommissionPayoutRow }
  | { kind: 'expense'; row: ExpenseRow };

const VOID_TITLE: Record<VoidTarget['kind'], string> = {
  payment: 'Void this payment?',
  charge: 'Void this line?',
  commission: 'Void this commission?',
  payout: 'Void this payment to the referrer?',
  expense: 'Void this expense?',
};

export function VoidSheet({ target, onClose, onSaved }: { target: VoidTarget | null; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={!!target} onClose={onClose} title={target ? VOID_TITLE[target.kind] : ''}>
      {target && <VoidForm target={target} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function VoidForm({ target, onClose, onSaved }: { target: VoidTarget; onClose: () => void; onSaved: (msg: string) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const voidPay = useVoidPayment();
  const voidCharge = useVoidCharge();
  const voidCommission = useVoidCommission();
  const voidPayout = useVoidCommissionPayout();
  const voidExpense = useVoidExpense();
  const m = { payment: voidPay, charge: voidCharge, commission: voidCommission, payout: voidPayout, expense: voidExpense }[target.kind];
  const [pick, setPick] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const reason = pick === 'Other' ? other.trim() : pick;

  const title =
    target.kind === 'payment'
      ? `${paymentLabel(target.row)} · ${formatDayMonth(target.row.paid_on)}`
      : target.kind === 'charge'
        ? `${target.row.kind === 'discount' ? 'Discount · ' : ''}${target.row.label}`
        : target.kind === 'commission'
          ? 'Referrer commission'
          : target.kind === 'expense'
            ? `${target.row.category} · ${formatDayMonth(target.row.paid_on)}`
            : `Paid to referrer · ${formatDayMonth(target.row.paid_on)} · ${PAYMENT_MODE_LABEL[target.row.mode]}`;

  const save = () => {
    if (!reason) return;
    m.mutate(
      { id: target.row.id, reason, by: user },
      {
        onSuccess: () => {
          onSaved('Voided. It stays on the record, struck through.');
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
        <span className="font-semibold">{title}</span>
        <span className="num text-[18px] font-bold">{formatRupees(target.row.amount)}</span>
      </div>
      <p className="text-[15px] text-muted">
        {target.kind === 'payout'
          ? 'Never deleted. Voiding keeps it on the record, struck through, and the commission shows as owed again.'
          : target.kind === 'expense'
            ? 'Expenses are never deleted. Voiding keeps this one on the record, struck through, and it stops counting. If the amount was wrong, add the correct one afterwards.'
            : 'Payments, charges and commission are never deleted. Voiding keeps this row on the record, struck through, and it stops counting. If the amount was wrong, add the correct one afterwards.'}
      </p>
      <Group label="Why">
        <Chips label="Reason" options={VOID_REASONS} value={pick} onChange={setPick} />
      </Group>
      {pick === 'Other' && <TextField label="Reason" value={other} onChange={setOther} />}
      <SaveError error={m.error} />
      {!online && <OfflineNote />}
      <Button size="lg" variant="danger" block disabled={!reason || !online || m.isPending} onClick={save}>
        {m.isPending ? 'Voiding…' : 'Void it'}
      </Button>
    </div>
  );
}
