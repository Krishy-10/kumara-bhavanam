/**
 * Insights charts. Thin bars (≤24px, 4px rounded tops, square at the
 * baseline), a 2px gap between neighbours, solid hairline grid, one y-axis,
 * a legend for two series, a tooltip on hover/focus, and a table twin.
 */
import { useReducedMotion } from 'motion/react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { formatRupees, formatRupeesCompact } from '@/lib/format';
import { colors } from '@/theme/colors';

export const SERIES = {
  booked: { label: 'Booked', color: colors.peacock.DEFAULT },
  collected: { label: 'Collected', color: colors.marigold.deep },
} as const;

export interface MonthRow {
  month: string;
  /** "Nov" (or "Nov ’25" when the range crosses a year). */
  label: string;
  /** Full name for the tooltip and table: "November 2026". */
  name: string;
  booked: number;
  collected: number;
  occupancy: number;
}

const axisTick = { fill: colors.muted, fontSize: 12, fontFamily: 'Anek Tamil, system-ui, sans-serif' };

function TooltipCard({ title, rows }: { title: string; rows: { key: string; color: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] shadow-lg">
      <p className="mb-1 font-semibold text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          <span className="num text-[15px] font-bold text-teak">{r.value}</span>
          <span className="text-muted">{r.key}</span>
        </p>
      ))}
    </div>
  );
}

function MoneyTooltip({ active, payload }: TooltipProps<number, string>) {
  const row = payload?.[0]?.payload as MonthRow | undefined;
  if (!active || !row) return null;
  return (
    <TooltipCard
      title={row.name}
      rows={[
        { key: SERIES.booked.label, color: SERIES.booked.color, value: formatRupees(row.booked) },
        { key: SERIES.collected.label, color: SERIES.collected.color, value: formatRupees(row.collected) },
      ]}
    />
  );
}

function OccupancyTooltip({ active, payload }: TooltipProps<number, string>) {
  const row = payload?.[0]?.payload as MonthRow | undefined;
  if (!active || !row) return null;
  return <TooltipCard title={row.name} rows={[{ key: 'of nights booked', color: SERIES.booked.color, value: `${row.occupancy}%` }]} />;
}

export function MoneyByMonthChart({ rows }: { rows: MonthRow[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-[230px]" role="img" aria-label="Column chart of booked and collected money by month. The same figures are in the table below.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%" accessibilityLayer>
          <CartesianGrid vertical={false} stroke={colors.line.DEFAULT} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: colors.line.strong }} interval="preserveStartEnd" minTickGap={4} />
          <YAxis tickFormatter={(v: number) => formatRupeesCompact(v)} tick={axisTick} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: colors.peacock.mist, opacity: 0.45 }} />
          <Bar dataKey="booked" name={SERIES.booked.label} fill={SERIES.booked.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduce} />
          <Bar dataKey="collected" name={SERIES.collected.label} fill={SERIES.collected.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduce} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OccupancyChart({ rows }: { rows: MonthRow[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-[190px]" role="img" aria-label="Column chart of the share of nights booked each month. The same figures are in the table below.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%" accessibilityLayer>
          <CartesianGrid vertical={false} stroke={colors.line.DEFAULT} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: colors.line.strong }} interval="preserveStartEnd" minTickGap={4} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} tick={axisTick} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<OccupancyTooltip />} cursor={{ fill: colors.peacock.mist, opacity: 0.45 }} />
          <Bar dataKey="occupancy" name="Nights booked" fill={SERIES.booked.color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduce} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars in plain HTML: name above, value at the tip, never clipped. */
export function RankedBars({ rows, format, label }: { rows: { key: string; value: number }[]; format: (n: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <span className="text-[14px] text-teak">{r.key}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px] bg-peacock"
              style={{ width: `${Math.max(2, (r.value / max) * 78)}%` }}
              aria-hidden="true"
            />
            <span className="num shrink-0 text-[14px] font-semibold text-teak">{format(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
