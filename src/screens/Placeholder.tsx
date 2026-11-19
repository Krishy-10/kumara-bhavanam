import { useParams } from 'react-router';
import { Screen, SubHeader } from '@/components/Layout';
import { useStays } from '@/data/hooks';
import { formatRange } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { STATUS_LABEL, plural } from '@/lib/labels';

/** Tabs built after the Home + New booking checkpoint. */
export function ComingNext({ title }: { title: string }) {
  return (
    <Screen>
      <header className="px-[22px] pt-1">
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
      </header>
      <p className="mx-[22px] mt-4 rounded-card border border-dashed border-line-strong bg-white p-5 text-[15px] text-muted">
        This screen is built in the next step.
      </p>
    </Screen>
  );
}

/** Temporary stay page until the full bill view is built. */
export function StaySummary() {
  const { stayId } = useParams();
  const stays = useStays();
  const stay = stays.data?.find((s) => s.stay_id === stayId);
  return (
    <Screen withNav={false}>
      <SubHeader title={stay?.guest_name ?? 'Stay'} subtitle={stay ? `${formatRange(stay.check_in, stay.check_out)} · ${plural(stay.nights, 'night')}` : undefined} />
      {stay && (
        <dl className="mx-[18px] mt-2 grid grid-cols-2 gap-y-3 rounded-card border border-line bg-white p-5 text-[15px]">
          <dt className="text-muted">Bill</dt>
          <dd className="num text-right font-semibold">{stay.bill_no}</dd>
          <dt className="text-muted">Status</dt>
          <dd className="text-right">{STATUS_LABEL[stay.status]}</dd>
          <dt className="text-muted">Total</dt>
          <dd className="num text-right font-semibold">{formatRupees(stay.final)}</dd>
          <dt className="text-muted">Paid</dt>
          <dd className="num text-right">{formatRupees(stay.net_paid)}</dd>
          <dt className="text-muted">Balance</dt>
          <dd className="num text-right font-semibold text-terracotta">{formatRupees(stay.balance)}</dd>
        </dl>
      )}
      <p className="mx-[22px] mt-4 text-[14px] text-muted">The full bill view with payments and actions is built in the next step.</p>
    </Screen>
  );
}
