/**
 * Referrer commission on Stay detail, and the sheets to add it and mark it
 * paid. Never part of the guest's bill: it sits below the bill, clearly
 * labelled. Amounts come from stay_totals (commission, commission_owed) and
 * the saved rows; nothing is worked out here.
 */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { DateField, Group, LabelledChips, MoneyField, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { useAddCommission, useAddCommissionPayouts, useCommissionPayouts, useStayCommissions } from '@/data/hooks';
import type { CommissionPayoutRow, PaymentMode, StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatDayMonth, formatShortDay } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { PAYMENT_MODE_LABEL, plural } from '@/lib/labels';
import { sumRupees } from '@/lib/money';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/session/UserContext';
import { MODES, OfflineNote, SaveError, type VoidTarget } from './MoneySheets';

export function CommissionCard({ stay, onVoid, onSaved }: { stay: StayRow; onVoid: (t: VoidTarget) => void; onSaved: (msg: string) => void }) {
  const online = useOnline();
  const commissions = useStayCommissions(stay.stay_id);
  const payouts = useCommissionPayouts();
  const [sheet, setSheet] = useState<'add' | 'pay' | null>(null);

  if (!stay.referrer_id) return null;
  const rows = commissions.data ?? [];
  const ids = new Set(rows.map((c) => c.id));
  const paidRows = (payouts.data ?? []).filter((p) => ids.has(p.commission_id));
  const livePayout = paidRows.find((p) => !p.voided && p.commission_id === stay.commission_id);

  return (
    <section aria-labelledby="commission-h" className="mx-4 mt-3 rounded-card border border-line bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="commission-h" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          Referrer commission
        </h2>
        <span className="text-[12px] text-muted">Not on the guest’s bill</span>
      </div>
      <p className="mt-1 text-[16px]">
        Referred by <strong className="font-semibold">{stay.referrer_name}</strong>
      </p>

      {commissions.isPending || payouts.isPending ? (
        <Skeleton className="mt-3 h-12" />
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-[15px]">
              {rows.map((c) => (
                <li key={c.id} className={cx('flex min-h-touch items-center justify-between gap-3', c.voided && 'text-muted line-through')}>
                  <span>
                    Commission{c.voided && c.void_reason ? <span className="no-underline"> · voided: {c.void_reason}</span> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="num font-semibold">{formatRupees(c.amount)}</span>
                    {!c.voided && (
                      <IconButton label="Void this commission" onClick={() => onVoid({ kind: 'commission', row: c })} disabled={!online} />
                    )}
                  </span>
                </li>
              ))}
              {paidRows.map((p) => (
                <PayoutLine key={p.id} p={p} onVoid={() => onVoid({ kind: 'payout', row: p })} disabled={!online} />
              ))}
            </ul>
          )}

          <div aria-live="polite" className="mt-3">
            {stay.commission_id === null ? (
              <Button variant="outline" block icon={<Icon name="plus" size={20} />} disabled={!online} onClick={() => setSheet('add')}>
                Add commission
              </Button>
            ) : stay.commission_owed > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-haldi px-4 py-2">
                <span className="text-[15px]">
                  <span className="num font-bold text-terracotta">{formatRupees(stay.commission_owed)}</span> owed to {firstWord(stay.referrer_name)}
                </span>
                <Button disabled={!online} onClick={() => setSheet('pay')}>
                  Mark paid
                </Button>
              </div>
            ) : (
              livePayout && (
                <p className="flex items-center gap-2 rounded-2xl bg-leaf/15 px-4 py-3 text-[15px] text-peacock">
                  <Icon name="check" size={20} />
                  Paid {formatDayMonth(livePayout.paid_on)} · {PAYMENT_MODE_LABEL[livePayout.mode]}
                </p>
              )
            )}
          </div>
        </>
      )}

      <AddCommissionSheet stay={stay} open={sheet === 'add'} onClose={() => setSheet(null)} onSaved={onSaved} />
      <PayoutSheet
        open={sheet === 'pay'}
        onClose={() => setSheet(null)}
        referrerName={stay.referrer_name ?? 'the referrer'}
        items={stay.commission_id ? [{ commissionId: stay.commission_id, amount: stay.commission_owed, label: `${stay.guest_name} · ${stay.bill_no}` }] : []}
        onSaved={onSaved}
      />
    </section>
  );
}

const firstWord = (name: string | null) => (name ?? 'the referrer').split(/[\s(]/)[0];

function IconButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid h-12 w-10 place-items-center rounded-full text-muted hover:bg-line/60 disabled:opacity-40">
      <Icon name="dots" size={18} />
    </button>
  );
}

function PayoutLine({ p, onVoid, disabled }: { p: CommissionPayoutRow; onVoid: () => void; disabled: boolean }) {
  return (
    <li className={cx('flex min-h-touch items-center justify-between gap-3', p.voided && 'text-muted line-through')}>
      <span>
        Paid {formatDayMonth(p.paid_on)} · {PAYMENT_MODE_LABEL[p.mode]}
        {p.voided && p.void_reason ? <span> · voided: {p.void_reason}</span> : null}
      </span>
      <span className="flex items-center gap-1">
        <span className="num font-semibold">− {formatRupees(p.amount)}</span>
        {!p.voided && <IconButton label="Void this payment to the referrer" onClick={onVoid} disabled={disabled} />}
      </span>
    </li>
  );
}

// ---- Add commission -----------------------------------------------------------

function AddCommissionSheet({ stay, open, onClose, onSaved }: { stay: StayRow; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add commission">
      {open && <AddCommissionForm stay={stay} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function AddCommissionForm({ stay, onClose, onSaved }: { stay: StayRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddCommission();
  const [amount, setAmount] = useState<number | null>(null);
  const valid = amount !== null && amount > 0;

  const save = () => {
    if (!valid) return;
    add.mutate(
      { stay_id: stay.stay_id, amount: amount!, created_by: user },
      {
        onSuccess: () => {
          onSaved(`Commission ${formatRupees(amount!)} for ${firstWord(stay.referrer_name)} saved`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] text-muted">
        For <strong className="font-semibold text-teak">{stay.referrer_name}</strong>, who referred {stay.guest_name}. It shows as owed until you mark it paid. It never appears on the guest’s bill.
      </p>
      <MoneyField label="Commission" value={amount} onChange={setAmount} />
      <SaveError error={add.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!valid || !online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : 'Save commission'}
      </Button>
    </div>
  );
}

// ---- Mark paid (one booking, or every booking owed to a referrer) -------------

export interface PayoutItem {
  commissionId: string;
  /** commission_owed from stay_totals. */
  amount: number;
  label: string;
}

export function PayoutSheet({
  open,
  onClose,
  referrerName,
  items,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  referrerName: string;
  items: PayoutItem[];
  onSaved: (msg: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Pay ${referrerName}`}>
      {open && <PayoutForm referrerName={referrerName} items={items} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function PayoutForm({ referrerName, items, onClose, onSaved }: { referrerName: string; items: PayoutItem[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddCommissionPayouts();
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const total = sumRupees(items.map((i) => i.amount));
  const valid = items.length > 0 && paidOn <= today;

  const save = () => {
    if (!valid) return;
    add.mutate(
      items.map((i) => ({ commission_id: i.commissionId, amount: i.amount, mode, paid_on: paidOn, reference: reference.trim() || null, created_by: user })),
      {
        onSuccess: () => {
          onSaved(`Paid ${referrerName.split(/[\s(]/)[0]} ${formatRupees(total)}`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
        {items.map((i) => (
          <li key={i.commissionId} className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 text-[15px]">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="num shrink-0 font-semibold">{formatRupees(i.amount)}</span>
          </li>
        ))}
        {items.length > 1 && (
          <li className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 text-[16px] font-semibold">
            <span>Total, {plural(items.length, 'booking')}</span>
            <span className="num" aria-live="polite">
              {formatRupees(total)}
            </span>
          </li>
        )}
      </ul>
      <Group label="Paid by">
        <LabelledChips label="Paid by" options={MODES} labels={PAYMENT_MODE_LABEL} value={mode} onChange={setMode} />
      </Group>
      <DateField label="Paid on" hint={formatShortDay(paidOn)} value={paidOn} max={today} onChange={setPaidOn} />
      <TextField label="Reference" hint="Optional: UPI ref" value={reference} onChange={setReference} autoComplete="off" />
      <SaveError error={add.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!valid || !online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : `Mark ${formatRupees(total)} paid`}
      </Button>
    </div>
  );
}
