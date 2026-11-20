/** The automatic reminders for Home and Tasks: worked out on the phone, never stored or sent. */
import { useMemo } from 'react';
import { useChecklistItems, useStays, useTicks } from '@/data/hooks';
import { arrivingSoon, reminders, type Reminder } from '@/lib/tasks';

export function useReminders(today: string): { data: Reminder[] | undefined; isPending: boolean; error: Error | null; refetch: () => void } {
  const stays = useStays();
  const items = useChecklistItems();
  const soonIds = useMemo(() => arrivingSoon(stays.data ?? [], today).map((s) => s.stay_id), [stays.data, today]);
  const ticks = useTicks(soonIds);
  const data = useMemo(
    () => (stays.data && items.data && ticks.data ? reminders(stays.data, items.data, ticks.data, today) : undefined),
    [stays.data, items.data, ticks.data, today],
  );
  return {
    data,
    isPending: stays.isPending || items.isPending || ticks.isPending,
    error: stays.error ?? items.error ?? ticks.error,
    refetch: () => {
      void stays.refetch();
      void items.refetch();
      void ticks.refetch();
    },
  };
}
