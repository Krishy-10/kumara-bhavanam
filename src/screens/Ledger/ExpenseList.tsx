/**
 * Ledger → Expenses: what the house cost, by the day paid, and what's left of
 * the cash collected after costs and referrer commission. Every sum comes
 * from money.ts. Expenses are never on a guest's bill; they're only voided.
 */
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { firstName } from '@/config/users';
import type { CommissionPayoutRow, ExpenseRow, PaymentRow, StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { formatDayMonth, formatMonthYear, monthKey, monthRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { PAYMENT_MODE_LABEL, plural } from '@/lib/labels';
import { collectedBetween, commissionPaidBetween, expensesBetween, expensesByCategory, leftAfterCosts } from '@/lib/money';
import { cx } from '@/lib/cx';
import { VoidSheet, type VoidTarget } from '@/screens/Stay/MoneySheets';
import { ExpenseSheet } from './ExpenseSheet';

/** [start, end) for a year ('2026') or every year ('all'). */
export function yearRange(year: string): { start: string; end: string } {
  return year === 'all' ? { start: '0001-01-01', end: '9999-12-31' } : { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` };
}

export function ExpenseList({
  expenses,
  payments,
  payouts,
  stays,
  year,
  onSaved,
}: {
  expenses: ExpenseRow[];
  payments: PaymentRow[];
  payouts: CommissionPayoutRow[];
  stays: StayRow[];
  year: string;
  onSaved: (msg: string) => void;
}) {
  const online = useOnline();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<VoidTarget | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);
  const { start, end } = yearRange(year);

  const spent = expensesBetween(expenses, start, end);
  const collected = collectedBetween(payments, start, end);
  const commission = commissionPaidBetween(payouts, start, end);
  const left = leftAfterCosts(collected.amount, spent.amount, commission.amount);
  const cats = expensesByCategory(expenses, start, end);
  const guest = useMemo(() => new Map(stays.map((s) => [s.stay_id, s.guest_name])), [stays]);

  // Rows in the year, newest first, grouped by month (voided ones shown struck through).
  const months = useMemo(() => {
    const rows = expenses.filter((e) => e.paid_on >= start && e.paid_on < end);
    const by = new Map<string, ExpenseRow[]>();
    for (const e of rows) by.set(monthKey(e.paid_on), [...(by.get(monthKey(e.paid_on)) ?? []), e]);
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [expenses, start, end]);

  const scope = year === 'all' ? 'all years' : year;
  const shownCats = showAllCats ? cats : cats.slice(0, 4);

  return (
    <section aria-label="Expenses" className="mt-3 flex flex-col gap-3 px-4">
      <dl className="grid grid-cols-2 gap-3" aria-live="polite">
        <div className="flex flex-col gap-0.5 rounded-card border border-line bg-white p-4">
          <dt className="text-[13px] text-muted">Spent in {scope}</dt>
          <dd className="num text-[22px] font-bold leading-tight">{formatRupees(spent.amount)}</dd>
          <dd className="text-[13px] text-muted">{plural(spent.count, 'expense')}</dd>
        </div>
        <div className={cx('flex flex-col gap-0.5 rounded-card border p-4', left < 0 ? 'border-terracotta-100 bg-terracotta-50' : 'border-line bg-white')}>
          <dt className="text-[13px] text-muted">Left after costs</dt>
          <dd className={cx('num text-[22px] font-bold leading-tight', left < 0 ? 'text-terracotta' : 'text-peacock')}>
            {formatRupees(left)}
          </dd>
          <dd className="text-[13px] text-muted">{left < 0 ? 'Spent more than collected' : 'collected − spent − commission'}</dd>
        </div>
        <div className="col-span-2 rounded-card border border-line bg-white px-4 py-2 text-[14px]">
          <div className="flex min-h-[32px] items-center justify-between">
            <dt className="text-muted">Collected (by date paid)</dt>
            <dd className="num font-semibold">{formatRupees(collected.amount)}</dd>
          </div>
          <div className="flex min-h-[32px] items-center justify-between">
            <dt className="text-muted">Spent on the house</dt>
            <dd className="num font-semibold">− {formatRupees(spent.amount)}</dd>
          </div>
          <div className="flex min-h-[32px] items-center justify-between">
            <dt className="text-muted">Commission paid to referrers</dt>
            <dd className="num font-semibold">− {formatRupees(commission.amount)}</dd>
          </div>
        </div>
      </dl>

      {cats.length > 0 && (
        <div className="rounded-card border border-line bg-white px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Where it went</h2>
          <ul className="mt-1 flex flex-col">
            {shownCats.map((c) => (
              <li key={c.category} className="flex min-h-[36px] items-center gap-3 text-[15px]">
                <span className="w-24 shrink-0">{c.category}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <span className="block h-full rounded-full bg-peacock" style={{ width: `${Math.max(3, (c.amount / cats[0]!.amount) * 100)}%` }} />
                </span>
                <span className="num w-20 shrink-0 text-right font-semibold">{formatRupees(c.amount)}</span>
              </li>
            ))}
          </ul>
          {cats.length > 4 && (
            <button type="button" onClick={() => setShowAllCats((v) => !v)} className="min-h-touch text-[15px] font-semibold text-peacock">
              {showAllCats ? 'Show fewer' : `Show all ${cats.length}`}
            </button>
          )}
        </div>
      )}

      <Button block icon={<Icon name="plus" size={20} />} onClick={() => setAdding(true)} disabled={!online}>
        Add expense
      </Button>

      {months.length === 0 && (
        <p className="rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">No expenses in {scope}.</p>
      )}

      {months.map(([m, rows]) => {
        const { start: ms, end: me } = monthRange(m);
        return (
          <div key={m}>
            <h2 className="mb-1.5 flex items-baseline justify-between px-1">
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{formatMonthYear(m)}</span>
              <span className="num text-[13px] font-semibold text-muted">{formatRupees(expensesBetween(rows, ms, me).amount)}</span>
            </h2>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
              {rows.map((e, i) => (
                <motion.li key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 8) * 0.02 }}>
                  <ExpenseLine e={e} stayName={e.stay_id ? guest.get(e.stay_id) : undefined} onVoid={() => setVoiding({ kind: 'expense', row: e })} disabled={!online} />
                </motion.li>
              ))}
            </ul>
          </div>
        );
      })}

      <p className="px-1 text-[13px] text-muted">Expenses are never on a guest’s bill. A wrong one is voided (it stays, struck through) and entered again.</p>

      <ExpenseSheet open={adding} onClose={() => setAdding(false)} onSaved={onSaved} />
      <VoidSheet target={voiding} onClose={() => setVoiding(null)} onSaved={onSaved} />
    </section>
  );
}

export function ExpenseLine({ e, stayName, onVoid, disabled }: { e: ExpenseRow; stayName?: string; onVoid: () => void; disabled: boolean }) {
  const sub = e.voided
    ? `Voided · ${e.void_reason ?? ''}`
    : [formatDayMonth(e.paid_on), PAYMENT_MODE_LABEL[e.mode], stayName ? `for ${firstName(stayName)}’s stay` : null, firstName(e.created_by)].filter(Boolean).join(' · ');
  return (
    <div className={cx('flex min-h-[60px] items-center gap-3 px-4 py-2', e.voided && 'text-muted')}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx('truncate text-[15px] font-semibold', e.voided && 'line-through')}>
          {e.category}
          {e.note && <span className="font-normal text-muted"> · {e.note}</span>}
        </span>
        <span className="truncate text-[13px] text-muted">{sub}</span>
      </span>
      <span className={cx('num shrink-0 text-[15px] font-semibold', e.voided && 'line-through')}>{formatRupees(e.amount)}</span>
      {!e.voided && (
        <button
          type="button"
          onClick={onVoid}
          disabled={disabled}
          aria-label={`${e.category} ${formatRupees(e.amount)} on ${formatDayMonth(e.paid_on)}. Void this expense`}
          className="grid h-12 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-line/60 disabled:opacity-40"
        >
          <Icon name="dots" size={18} />
        </button>
      )}
    </div>
  );
}

/** Stay detail: expenses linked to this stay. Shown only when there are some. */
export function StayExpenses({ expenses, onVoid }: { expenses: ExpenseRow[]; onVoid: (t: VoidTarget) => void }) {
  const online = useOnline();
  if (expenses.length === 0) return null;
  return (
    <section aria-labelledby="stay-exp-h" className="mx-4 mt-3 rounded-card border border-line bg-white py-2">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h2 id="stay-exp-h" className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          Expenses for this stay
        </h2>
        <span className="text-[12px] text-muted">Not on the guest’s bill</span>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {expenses.map((e) => (
          <li key={e.id}>
            <ExpenseLine e={e} onVoid={() => onVoid({ kind: 'expense', row: e })} disabled={!online} />
          </li>
        ))}
      </ul>
      <Link to="/ledger?tab=expenses" className="flex min-h-touch items-center px-4 text-[15px] font-semibold text-peacock">
        All expenses
      </Link>
    </section>
  );
}
