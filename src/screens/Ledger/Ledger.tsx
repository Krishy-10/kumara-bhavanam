/**
 * Ledger: every booking's money in one list (by year), what's received and
 * still due, referrers and the commission owed to them, past stays, and CSV
 * export, and expenses. All sums come from money.ts over stay_totals rows
 * and saved payment / expense rows.
 */
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { useAllPayments, useCommissionPayouts, useExpenses, useReferrers, useStays } from '@/data/hooks';
import type { CommissionPayoutRow, ExpenseRow, PaymentRow, ReferrerRow, StayRow } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { bookingsCsv, csvFileName, expensesCsv, paymentsCsv } from '@/lib/csv';
import { formatDayMonth, formatMonthYear, monthKey } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { plural } from '@/lib/labels';
import { balanceState, ledgerSummary, referrerTotals, type ReferrerTotals } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { downloadFile, shareFile } from '@/lib/share';
import { cx } from '@/lib/cx';
import { PayoutSheet, type PayoutItem } from '@/screens/Stay/CommissionCard';
import { ExpenseList, yearRange } from './ExpenseList';

type Tab = 'bookings' | 'referrers' | 'expenses';
const ALL = 'all';

export function Ledger() {
  const stays = useStays();
  const payments = useAllPayments();
  const referrers = useReferrers();
  const expenses = useExpenses();
  const payouts = useCommissionPayouts();
  const error = stays.error ?? payments.error ?? referrers.error ?? expenses.error ?? payouts.error;

  return (
    <Screen>
      {error ? (
        <>
          <LedgerHeader />
          <ErrorState message={error.message} onRetry={() => void Promise.all([stays.refetch(), payments.refetch(), referrers.refetch(), expenses.refetch(), payouts.refetch()])} />
        </>
      ) : !stays.data || !payments.data || !referrers.data || !expenses.data || !payouts.data ? (
        <>
          <LedgerHeader />
          <div className="flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-12" />
            <Skeleton className="h-[150px]" />
            <Skeleton className="h-[300px]" />
          </div>
        </>
      ) : (
        <LedgerBody stays={stays.data} payments={payments.data} referrers={referrers.data} expenses={expenses.data} payouts={payouts.data} />
      )}
    </Screen>
  );
}

function LedgerHeader({ onExport }: { onExport?: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="flex flex-col gap-3 px-[22px] pb-3 pt-1">
      <h1 className="text-[26px] font-bold tracking-tight">Ledger</h1>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="outline" className="px-3" icon={<Icon name="plus" size={20} />} onClick={() => navigate('/ledger/past')} aria-label="Add past stay">
          Past stay
        </Button>
        <Button variant="outline" className="px-3" icon={<Icon name="share" size={20} />} onClick={onExport} disabled={!onExport}>
          Export CSV
        </Button>
      </div>
    </header>
  );
}

function LedgerBody({
  stays,
  payments,
  referrers,
  expenses,
  payouts,
}: {
  stays: StayRow[];
  payments: PaymentRow[];
  referrers: ReferrerRow[];
  expenses: ExpenseRow[];
  payouts: CommissionPayoutRow[];
}) {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const { toast, show, hide } = useToast();

  const years = useMemo(
    () => [...new Set([...stays.map((s) => s.check_in.slice(0, 4)), ...expenses.map((e) => e.paid_on.slice(0, 4))])].sort().reverse(),
    [stays, expenses],
  );
  const thisYear = today.slice(0, 4);
  const yearParam = params.get('y');
  const year = yearParam === ALL || (yearParam && years.includes(yearParam)) ? yearParam : years.includes(thisYear) ? thisYear : (years[0] ?? ALL);
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'referrers' || tabParam === 'expenses' ? tabParam : 'bookings';
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const inYear = useMemo(() => (year === ALL ? stays : stays.filter((s) => s.check_in.startsWith(year))), [stays, year]);
  const summary = ledgerSummary(inYear);

  return (
    <>
      <LedgerHeader onExport={() => setExporting(true)} />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Year">
        {[...years, ALL].map((y) => (
          <button
            key={y}
            type="button"
            role="radio"
            aria-checked={y === year}
            onClick={() => setParam('y', y === thisYear ? null : y)}
            className={cx(
              'num min-h-touch shrink-0 rounded-full border px-4 text-[15px] font-medium transition-colors',
              y === year ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-teak',
            )}
          >
            {y === ALL ? 'All years' : y}
          </button>
        ))}
      </div>

      <dl className="mx-4 mt-3 grid grid-cols-2 gap-3" aria-live="polite">
        <Figure label="Booked" value={formatRupees(summary.booked)} sub={plural(summary.count, 'booking')} />
        <Figure label="Received" value={formatRupees(summary.received)} sub="less refunds" />
        <Figure label="To collect" value={formatRupees(summary.toCollect)} sub="checked in or stayed" tone={summary.toCollect > 0 ? 'due' : undefined} />
        <Figure label="Due ahead" value={formatRupees(summary.dueAhead)} sub="bookings not yet arrived" />
        <div
          className={cx(
            'col-span-2 flex items-baseline justify-between gap-3 rounded-card border px-4 py-3',
            summary.commissionOwed > 0 ? 'border-terracotta-100 bg-terracotta-50' : 'border-line bg-white',
          )}
        >
          <dt className="text-[14px] text-muted">Commission owed to referrers</dt>
          <dd className={cx('num text-[18px] font-bold', summary.commissionOwed > 0 && 'text-terracotta')}>{formatRupees(summary.commissionOwed)}</dd>
        </div>
      </dl>

      <div className="mx-4 mt-5">
        <Segmented<Tab>
          label="Ledger view"
          name="ledger-tab"
          value={tab}
          onChange={(t) => setParam('tab', t === 'bookings' ? null : t)}
          options={[
            { value: 'bookings', label: 'Bookings' },
            { value: 'referrers', label: 'Referrers' },
            { value: 'expenses', label: 'Expenses' },
          ]}
        />
      </div>

      {tab === 'bookings' ? (
        <BookingList stays={inYear} query={query} onQuery={setQuery} year={thisYear} />
      ) : tab === 'referrers' ? (
        <ReferrerList stays={stays} referrers={referrers} onPaid={(text) => show({ text })} />
      ) : (
        <ExpenseList expenses={expenses} payments={payments} payouts={payouts} stays={stays} year={year} onSaved={(text) => show({ text })} />
      )}
      <div className="h-4" />

      <ExportSheet
        open={exporting}
        onClose={() => setExporting(false)}
        stays={inYear}
        allStays={stays}
        payments={payments}
        expenses={expenses}
        year={year}
        today={today}
        onDone={(text, tone) => show({ text, tone })}
      />
      <Toast toast={toast} onHide={hide} />
    </>
  );
}

function Figure({ label, value, sub, tone, className }: { label: string; value: string; sub: string; tone?: 'due'; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5 rounded-card border p-4', tone === 'due' ? 'border-terracotta-100 bg-terracotta-50' : 'border-line bg-white', className)}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cx('num text-[22px] font-bold leading-tight', tone === 'due' && 'text-terracotta')}>{value}</dd>
      <dd className="text-[13px] text-muted">{sub}</dd>
    </div>
  );
}

// ---- Bookings -------------------------------------------------------------------

function matchesQuery(s: StayRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  return (
    s.guest_name.toLowerCase().includes(t) ||
    s.bill_no.toLowerCase().includes(t) ||
    (s.referrer_name ?? '').toLowerCase().includes(t) ||
    (digits.length >= 3 && s.guest_phone.includes(digits))
  );
}

function BookingList({ stays, query, onQuery, year }: { stays: StayRow[]; query: string; onQuery: (q: string) => void; year: string }) {
  const months = useMemo(() => {
    const shown = stays.filter((s) => matchesQuery(s, query)).sort((a, b) => (a.check_in < b.check_in ? 1 : a.check_in > b.check_in ? -1 : 0));
    const by = new Map<string, StayRow[]>();
    for (const s of shown) by.set(monthKey(s.check_in), [...(by.get(monthKey(s.check_in)) ?? []), s]);
    return [...by.entries()];
  }, [stays, query]);

  return (
    <section aria-label="Bookings" className="mt-3 px-4">
      <label className="relative block">
        <span className="sr-only">Search bookings</span>
        <Icon name="search" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Name, bill no., phone or referrer"
          className="min-h-touch w-full rounded-2xl border border-line-strong bg-white pl-11 pr-4 text-[16px] focus:border-peacock focus:outline-none"
        />
      </label>

      {months.length === 0 && (
        <p className="mt-3 rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">
          {query ? 'No bookings match.' : 'No bookings in this year.'}
        </p>
      )}

      {months.map(([m, rows]) => (
        <div key={m} className="mt-4">
          <h2 className="mb-1.5 flex items-baseline justify-between px-1">
            <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{formatMonthYear(m)}</span>
            <span className="text-[13px] text-muted">{plural(rows.length, 'booking')}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
            {rows.map((s, i) => (
              <motion.li key={s.stay_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 8) * 0.02 }}>
                <LedgerRow stay={s} year={year} />
              </motion.li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function LedgerRow({ stay, year }: { stay: StayRow; year: string }) {
  const b = balanceState(stay.balance);
  const cancelled = stay.status === 'cancelled';
  const ahead = stay.status === 'enquiry' || stay.status === 'tentative' || stay.status === 'confirmed';
  return (
    <Link to={`/stays/${stay.stay_id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 hover:bg-haldi/50">
      <span className="num w-11 shrink-0 text-center leading-tight">
        <span className="block text-[18px] font-bold">{Number(stay.check_in.slice(8))}</span>
        <span className="block text-[11px] uppercase text-muted">{formatDayMonth(stay.check_in).split(' ')[1]}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx('truncate text-[15px] font-semibold', cancelled && 'text-muted line-through')}>{stay.guest_name}</span>
        <span className="num truncate text-[13px] text-muted">
          {stay.bill_no}
          {stay.check_in.slice(0, 4) !== year && ` · ${stay.check_in.slice(0, 4)}`}
          {stay.referrer_name && ` · via ${stay.referrer_name.split(/[\s(]/)[0]}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className={cx('num text-[15px] font-semibold', cancelled && 'text-muted')}>{cancelled ? 'Cancelled' : formatRupees(stay.final)}</span>
        <span className={cx('num text-[13px]', b.kind === 'due' && !ahead ? 'text-terracotta' : b.kind === 'overpaid' ? 'text-terracotta' : 'text-muted')}>
          {cancelled
            ? stay.net_paid > 0
              ? `${formatRupees(stay.net_paid)} kept`
              : '—'
            : b.kind === 'paid'
              ? 'Paid'
              : b.kind === 'overpaid'
                ? `Overpaid ${formatRupees(b.amount)}`
                : `${formatRupees(b.amount)} ${ahead ? 'to come' : 'due'}`}
        </span>
        {stay.commission_owed > 0 && <span className="num text-[12px] text-terracotta">Comm. {formatRupees(stay.commission_owed)} owed</span>}
      </span>
    </Link>
  );
}

// ---- Referrers ------------------------------------------------------------------

function ReferrerList({ stays, referrers, onPaid }: { stays: StayRow[]; referrers: ReferrerRow[]; onPaid: (msg: string) => void }) {
  const [paying, setPaying] = useState<{ name: string; items: PayoutItem[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const totals = referrerTotals(stays);
  const byId = new Map(referrers.map((r) => [r.id, r]));
  const unused = referrers.filter((r) => !totals.some((t) => t.referrerId === r.id));

  return (
    <section aria-label="Referrers" className="mt-3 flex flex-col gap-3 px-4">
      <p className="px-1 text-[14px] text-muted">All years. Commission is never on a guest’s bill.</p>
      {totals.length === 0 && unused.length === 0 && (
        <p className="rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">
          No referrers yet. Tick Referral in “How they found us” on a booking to add one.
        </p>
      )}
      {totals.map((t) => {
        const r = byId.get(t.referrerId);
        const theirs = stays.filter((s) => s.referrer_id === t.referrerId).sort((a, b) => (a.check_in < b.check_in ? 1 : -1));
        const name = r?.name ?? theirs[0]?.referrer_name ?? 'Referrer';
        return (
          <ReferrerCard
            key={t.referrerId}
            name={name}
            phone={r?.phone ?? null}
            totals={t}
            stays={theirs}
            expanded={open === t.referrerId}
            onToggle={() => setOpen((cur) => (cur === t.referrerId ? null : t.referrerId))}
            onPay={() =>
              setPaying({
                name,
                items: theirs
                  .filter((s) => s.commission_id && s.commission_owed > 0)
                  .map((s) => ({ commissionId: s.commission_id!, amount: s.commission_owed, label: `${s.guest_name} · ${formatDayMonth(s.check_in)} ${s.check_in.slice(0, 4)}` })),
              })
            }
          />
        );
      })}
      {unused.length > 0 && (
        <div>
          <h2 className="mb-1.5 mt-2 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">No bookings yet</h2>
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
            {unused.map((r) => (
              <li key={r.id} className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 text-[15px]">
                <span className="truncate">{r.name}</span>
                {r.phone && <span className="num shrink-0 text-[14px] text-muted">{formatPhone(r.phone)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <PayoutSheet open={!!paying} onClose={() => setPaying(null)} referrerName={paying?.name ?? ''} items={paying?.items ?? []} onSaved={onPaid} />
    </section>
  );
}

function ReferrerCard({
  name,
  phone,
  totals,
  stays,
  expanded,
  onToggle,
  onPay,
}: {
  name: string;
  phone: string | null;
  totals: ReferrerTotals;
  stays: StayRow[];
  expanded: boolean;
  onToggle: () => void;
  onPay: () => void;
}) {
  const noCommission = stays.filter((s) => s.status !== 'cancelled' && !s.commission_id).length;
  return (
    <div className={cx('rounded-card border bg-white', totals.owed > 0 ? 'border-terracotta-100' : 'border-line')}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[17px] font-semibold">{name}</span>
          <span className="text-[14px] text-muted">
            {plural(totals.bookings, 'booking')}
            {phone && <span className="num"> · {formatPhone(phone)}</span>}
          </span>
          <span className="num text-[14px] text-muted">
            Commission {formatRupees(totals.commission)} · paid {formatRupees(totals.paid)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {totals.owed > 0 ? (
            <span className="num text-[16px] font-bold text-terracotta">{formatRupees(totals.owed)} owed</span>
          ) : (
            <span className="text-[14px] text-muted">Nothing owed</span>
          )}
          <Icon name="chevron" size={18} className={cx('text-muted transition-transform', expanded ? '-rotate-90' : 'rotate-90')} />
        </span>
      </button>

      {totals.owed > 0 && (
        <div className="px-4 pb-3">
          <Button block onClick={onPay}>
            Pay {formatRupees(totals.owed)}
          </Button>
        </div>
      )}

      {expanded && (
        <div className="fade-in border-t border-line px-4 pb-3 pt-2">
          {noCommission > 0 && <p className="py-1 text-[14px] text-muted">{plural(noCommission, 'booking')} with no commission set. Open one to add it.</p>}
          <ul className="flex flex-col">
            {stays.map((s) => (
              <li key={s.stay_id}>
                <Link to={`/stays/${s.stay_id}`} className="flex min-h-touch items-center justify-between gap-3 py-1.5 text-[15px]">
                  <span className="min-w-0 truncate">
                    {s.guest_name}
                    <span className="num text-muted">
                      {' '}
                      · {formatDayMonth(s.check_in)} {s.check_in.slice(0, 4)}
                    </span>
                  </span>
                  <span className={cx('num shrink-0 text-[14px]', s.commission_owed > 0 ? 'font-semibold text-terracotta' : 'text-muted')}>
                    {s.status === 'cancelled'
                      ? 'Cancelled'
                      : !s.commission_id
                        ? 'Not set'
                        : s.commission_owed > 0
                          ? `${formatRupees(s.commission_owed)} owed`
                          : `${formatRupees(s.commission)} paid`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- CSV export -----------------------------------------------------------------

function ExportSheet({
  open,
  onClose,
  stays,
  allStays,
  payments,
  expenses,
  year,
  today,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  stays: StayRow[];
  allStays: StayRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  year: string;
  today: string;
  onDone: (msg: string, tone?: 'error') => void;
}) {
  const ids = new Set(stays.map((s) => s.stay_id));
  const pays = payments.filter((p) => ids.has(p.stay_id));
  const scope = year === ALL ? 'all years' : year;
  const { start, end } = yearRange(year);
  const exps = expenses.filter((e) => e.paid_on >= start && e.paid_on < end);

  const send = async (what: 'bookings' | 'payments' | 'expenses') => {
    const text = what === 'bookings' ? bookingsCsv(stays) : what === 'payments' ? paymentsCsv(pays, stays) : expensesCsv(exps, allStays);
    const name = csvFileName(what, year === ALL ? today : `${year} (${today})`);
    const file = new File([text], name, { type: 'text/csv' });
    const r = await shareFile(file, name);
    if (r === 'unsupported' || r === 'failed') {
      downloadFile(file);
      onDone(`Saved ${name}`);
    } else if (r === 'shared') {
      onDone('Shared');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Export CSV">
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-[15px] text-muted">
          For <strong className="font-semibold text-teak">{scope}</strong>. Opens in Excel or Google Sheets. Amounts are whole rupees. No ID details are included.
        </p>
        <Button size="lg" block icon={<Icon name="share" size={20} />} onClick={() => void send('bookings')} disabled={stays.length === 0}>
          Bookings ({plural(stays.length, 'row')})
        </Button>
        <Button size="lg" block variant="outline" icon={<Icon name="share" size={20} />} onClick={() => void send('payments')} disabled={pays.length === 0}>
          Payments ({plural(pays.length, 'row')})
        </Button>
        <Button size="lg" block variant="outline" icon={<Icon name="share" size={20} />} onClick={() => void send('expenses')} disabled={exps.length === 0}>
          Expenses ({plural(exps.length, 'row')})
        </Button>
        <p className="text-[13px] text-muted">
          Payments lists every payment for these bookings; expenses are by the day paid. Voided rows are included and marked.
        </p>
      </div>
    </Sheet>
  );
}
