/** Guests: search by name, phone or city. Archived guests are hidden unless asked for. */
import { motion } from 'motion/react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton } from '@/components/Layout';
import { Toggle } from '@/components/Controls';
import { initials } from '@/config/users';
import { useGuests, useStays } from '@/data/hooks';
import { formatMonthShort, monthKey } from '@/lib/dates';
import { useToday } from '@/hooks/useToday';
import { formatRupees } from '@/lib/format';
import { plural } from '@/lib/labels';
import { matches, summarise } from '@/lib/guests';
import { readSession, writeSession } from '@/lib/storage';

const QUERY_KEY = 'kb.guestSearch';

export function Guests() {
  const today = useToday();
  const guests = useGuests();
  const stays = useStays();
  const [query, setQuery] = useState(() => readSession<string>(QUERY_KEY) ?? '');
  const [archived, setArchived] = useState(false);
  const searchId = useId();

  const rows = useMemo(() => {
    if (!guests.data || !stays.data) return [];
    return guests.data
      .filter((g) => (archived ? true : !g.archived_at) && matches(g, query))
      .map((g) => ({ g, sum: summarise(g.id, stays.data) }))
      .sort((a, b) => ((a.sum.last?.check_in ?? '') < (b.sum.last?.check_in ?? '') ? 1 : -1));
  }, [guests.data, stays.data, query, archived]);

  const error = guests.error ?? stays.error;

  return (
    <Screen>
      <header className="px-[22px] pt-1">
        <h1 className="text-[26px] font-bold tracking-tight">Guests</h1>
      </header>

      <div className="sticky top-0 z-10 bg-jasmine px-4 pb-2 pt-3">
        <label htmlFor={searchId} className="sr-only">
          Search guests by name, phone or city
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              writeSession(QUERY_KEY, e.target.value);
            }}
            placeholder="Name, phone or city"
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-touch w-full rounded-2xl border border-line-strong bg-white pl-12 pr-4 text-[17px] placeholder:text-muted/60 focus:border-peacock focus:shadow-[0_0_0_4px_rgba(15,94,90,0.12)] focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={() => void Promise.all([guests.refetch(), stays.refetch()])} />
      ) : !guests.data || !stays.data ? (
        <div className="flex flex-col gap-2.5 px-4" aria-busy="true" aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : (
        <>
          <p className="px-[22px] pb-2 text-[14px] text-muted" aria-live="polite">
            {query ? `${plural(rows.length, 'guest')} found` : plural(rows.length, 'guest')}
          </p>
          <ul className="flex flex-col gap-2.5 px-4">
            {rows.map(({ g, sum }, i) => (
              <motion.li key={g.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }}>
                <Link
                  to={`/guests/${g.id}`}
                  className="flex min-h-[72px] items-center gap-3 rounded-card border border-line bg-white px-4 py-3 transition-transform active:scale-[0.99]"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peacock/10 text-[15px] font-bold text-peacock" aria-hidden="true">
                    {initials(g.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-semibold">
                      {g.name}
                      {g.archived_at && <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-[12px] font-semibold text-muted">Archived</span>}
                    </span>
                    <span className="truncate text-[14px] text-muted">
                      {[g.city, sum.visits > 0 ? plural(sum.visits, 'stay') : 'No stays yet', sum.last ? `${sum.last.check_in > today ? 'next' : 'last'} ${formatMonthShort(monthKey(sum.last.check_in))}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {sum.spent > 0 && <span className="num shrink-0 text-[15px] font-semibold">{formatRupees(sum.spent)}</span>}
                </Link>
              </motion.li>
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="mx-4 rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">
              {query ? 'No guest matches that. Try part of the name or the last digits of the phone.' : 'No guests yet. They’re added when you save a booking.'}
            </p>
          )}
          <div className="mx-4 mt-4 rounded-card border border-line bg-white px-4 py-1">
            <Toggle label="Show archived guests" checked={archived} onChange={setArchived} />
          </div>
        </>
      )}
    </Screen>
  );
}

