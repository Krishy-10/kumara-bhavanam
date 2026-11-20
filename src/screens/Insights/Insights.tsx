/**
 * Insights: booked revenue (split night by night into months), cash collected
 * (by payment date), occupancy, and where bookings come from. One filter row
 * scopes everything below it. Every rupee comes from money.ts.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorState, Screen, Skeleton } from '@/components/Layout';
import { useAllPayments, useStays } from '@/data/hooks';
import type { PaymentRow, StayRow } from '@/data/types';
import { useToday } from '@/hooks/useToday';
import { arrivalsBy, occupancy, PERIOD_LABEL, periodMonths, ranked, spanOf, type Period } from '@/lib/analytics';
import { formatMonthYear, monthRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { OCCASIONS, SOURCES, plural } from '@/lib/labels';
import { bookedRevenueBy, bookedRevenueByMonth, collectedBetween, collectedByMonth, sumRupees } from '@/lib/money';
import { cx } from '@/lib/cx';
import { MoneyByMonthChart, OccupancyChart, RankedBars, SERIES, type MonthRow } from './Charts';

const PERIODS: Period[] = ['month', '3m', '6m', '12m', 'fy', 'next3'];
const ALL = 'all';
const NOT_TAGGED = 'Not tagged';

export function Insights() {
  const stays = useStays();
  const payments = useAllPayments();
  const error = stays.error ?? payments.error;

  return (
    <Screen>
      <header className="px-[22px] pt-1">
        <h1 className="text-[26px] font-bold tracking-tight">Insights</h1>
      </header>
      {error ? (
        <div className="mt-4">
          <ErrorState message={error.message} onRetry={() => void Promise.all([stays.refetch(), payments.refetch()])} />
        </div>
      ) : !stays.data || !payments.data ? (
        <div className="mt-4 flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-12" />
          <Skeleton className="h-28" />
          <Skeleton className="h-[260px]" />
        </div>
      ) : (
        <Dashboard stays={stays.data} payments={payments.data} />
      )}
    </Screen>
  );
}

function Dashboard({ stays, payments }: { stays: StayRow[]; payments: PaymentRow[] }) {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const period = (PERIODS as string[]).includes(params.get('p') ?? '') ? (params.get('p') as Period) : '12m';
  const occasion = params.get('occasion') ?? ALL;
  const source = params.get('source') ?? ALL;
  const [showTable, setShowTable] = useState(false);
  const chipRow = useRef<HTMLDivElement>(null);
  // Keep the chosen period visible in the scrolling chip row.
  useEffect(() => {
    chipRow.current?.querySelector<HTMLElement>('[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [period]);

  const setFilter = (k: string, v: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (v === fallback) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const view = useMemo(() => {
    const months = periodMonths(period, today);
    const { start, end } = spanOf(months);
    const crossesYear = months[0]!.slice(0, 4) !== months[months.length - 1]!.slice(0, 4);

    const picked = stays.filter(
      (s) => (occasion === ALL || (s.occasion ?? NOT_TAGGED) === occasion) && (source === ALL || (source === NOT_TAGGED ? s.sources.length === 0 : s.sources.includes(source))),
    );
    const filtered = occasion !== ALL || source !== ALL;
    const ids = new Set(picked.map((s) => s.stay_id));
    const pays = filtered ? payments.filter((p) => ids.has(p.stay_id)) : payments;

    const bookedMap = bookedRevenueByMonth(picked, months);
    const collectedMap = collectedByMonth(pays, months);
    const rows: MonthRow[] = months.map((m) => {
      const r = monthRange(m);
      const name = formatMonthYear(m);
      return {
        month: m,
        name,
        label: crossesYear ? `${name.slice(0, 3)} ’${m.slice(2, 4)}` : name.slice(0, 3),
        booked: bookedMap.get(m) ?? 0,
        collected: collectedMap.get(m)?.amount ?? 0,
        occupancy: occupancy(picked, r.start, r.end).pct,
      };
    });

    return {
      months,
      rows,
      booked: sumRupees(rows.map((r) => r.booked)),
      collected: collectedBetween(pays, start, end),
      occ: occupancy(picked, start, end),
      arrivals: arrivalsBy(picked, () => 'all', start, end).get('all') ?? 0,
      cancelled: picked.filter((s) => s.status === 'cancelled' && s.check_in >= start && s.check_in < end).length,
      byOccasion: ranked(bookedRevenueBy(picked, (s) => s.occasion ?? NOT_TAGGED, start, end)),
      bySource: ranked(arrivalsBy(picked, (s) => (s.sources.length > 0 ? s.sources : NOT_TAGGED), start, end)),
      future: end > today && period !== 'month',
    };
  }, [stays, payments, period, occasion, source, today]);

  const multi = view.months.length > 1;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* One filter block scopes everything below it. */}
      <section aria-label="Filters" className="flex flex-col gap-2.5 pt-3">
        <div ref={chipRow} className="no-scrollbar flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === period}
              data-selected={p === period || undefined}
              onClick={() => setFilter('p', p, '12m')}
              className={cx(
                'min-h-touch shrink-0 rounded-full border px-4 text-[15px] font-medium transition-colors',
                p === period ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-teak',
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 px-4">
          <SelectFilter label="Occasion" value={occasion} options={[...OCCASIONS, NOT_TAGGED]} onChange={(v) => setFilter('occasion', v, ALL)} />
          <SelectFilter label="Came via" value={source} options={[...SOURCES, NOT_TAGGED]} onChange={(v) => setFilter('source', v, ALL)} />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-live="polite">
        <div className="mx-4 rounded-hero bg-peacock p-5 text-white">
          <p className="text-[14px] text-peacock-mist">Booked revenue · {PERIOD_LABEL[period].toLowerCase()}</p>
          <p className="font-display text-[44px] font-bold leading-tight">{formatRupees(view.booked)}</p>
          <p className="text-[14px] text-peacock-mist">
            {formatMonthYear(view.months[0]!)}
            {multi && ` to ${formatMonthYear(view.months[view.months.length - 1]!)}`}
            {view.future && ' · includes bookings ahead'}
          </p>
        </div>

        <dl className="mx-4 grid grid-cols-2 gap-3">
          <Tile label="Cash collected" value={formatRupees(view.collected.amount)} sub={`${plural(view.collected.count, 'payment')}, by date paid`} />
          <Tile label="Nights booked" value={`${view.occ.pct}%`} sub={`${view.occ.booked} of ${view.occ.nights} nights`} />
          <Tile label="Arrivals" value={String(view.arrivals)} sub="stays starting in this period" />
          <Tile label="Cancelled" value={String(view.cancelled)} sub="not counted in booked" />
        </dl>

        {multi ? (
          <>
            <Card title="Booked and collected, by month" sub="Booked splits each stay across its nights. Collected is money received, less refunds.">
              <ul className="mb-2 flex gap-4 text-[13px] text-muted" aria-label="Legend">
                {Object.values(SERIES).map((s) => (
                  <li key={s.label} className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
                    {s.label}
                  </li>
                ))}
              </ul>
              <MoneyByMonthChart rows={view.rows} />
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                aria-expanded={showTable}
                className="mt-1 min-h-touch text-[14px] font-semibold text-peacock underline underline-offset-4"
              >
                {showTable ? 'Hide table' : 'Show as table'}
              </button>
              {showTable && <MonthTable rows={view.rows} />}
            </Card>

            <Card title="Nights booked, by month" sub="Confirmed, checked-in and completed stays. Tentative holds don’t count.">
              <OccupancyChart rows={view.rows} />
            </Card>
          </>
        ) : (
          <p className="mx-4 rounded-2xl bg-haldi p-4 text-[15px]">Pick a longer period to see months side by side.</p>
        )}

        <Card title="Booked revenue by occasion">
          {view.byOccasion.length ? (
            <RankedBars rows={view.byOccasion} format={formatRupees} label="Booked revenue by occasion" />
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Where bookings came from" sub="Stays arriving in this period. A booking found us more than one way counts under each.">
          {view.bySource.length ? (
            <RankedBars rows={view.bySource} format={(n) => plural(n, 'stay')} label="Bookings by source" />
          ) : (
            <Empty />
          )}
        </Card>
      </section>
    </div>
  );
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-1 text-[13px] font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'min-h-touch w-full rounded-2xl border bg-white px-3 text-[16px] focus:border-peacock focus:outline-none',
          value === ALL ? 'border-line-strong text-teak' : 'border-peacock font-semibold text-peacock',
        )}
      >
        <option value={ALL}>All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line bg-white p-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="font-display text-[24px] font-bold leading-tight">{value}</dd>
      <dd className="text-[13px] text-muted">{sub}</dd>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="mx-4 rounded-card border border-line bg-white p-4">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {sub && <p className="mb-3 mt-0.5 text-[13px] text-muted">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-[15px] text-muted">Nothing in this period.</p>;
}

function MonthTable({ rows }: { rows: MonthRow[] }) {
  return (
    <div className="-mx-1 mt-2 overflow-x-auto">
      <table className="w-full text-[14px]">
        <caption className="sr-only">Booked, collected and nights booked by month</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="py-2 pr-2 font-semibold">
              Month
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              Booked
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              Collected
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Nights
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-2 text-left font-normal">
                {r.label}
              </th>
              <td className="num py-2 pr-2 text-right">{formatRupees(r.booked)}</td>
              <td className="num py-2 pr-2 text-right">{formatRupees(r.collected)}</td>
              <td className="num py-2 text-right">{r.occupancy}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
