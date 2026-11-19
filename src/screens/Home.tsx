import { DemoBadge } from '@/components/DemoBadge';
import { formatLongDay, todayIST } from '@/lib/dates';

/** Phase 1 placeholder. The real Home is built in Phase 2. */
export function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-app flex-col px-[22px] pt-7">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] text-muted">வணக்கம் · {formatLongDay(todayIST())}</span>
          <h1 className="text-[26px] font-bold tracking-tight">Kumara Bhavanam</h1>
        </div>
        <DemoBadge />
      </header>
    </main>
  );
}
