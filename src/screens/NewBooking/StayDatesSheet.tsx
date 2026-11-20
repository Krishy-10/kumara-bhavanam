/**
 * Pick the stay's dates on a calendar that shows what's already booked:
 * tap the check-in day, then the check-out day. Tap the month name to jump
 * months or years ahead.
 */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Sheet } from '@/components/Sheet';
import { useBlockedDates, useStays } from '@/data/hooks';
import { useToday } from '@/hooks/useToday';
import { addDays, addMonths, formatShortDay, monthKey, nightsBetween, type ISODate } from '@/lib/dates';
import { plural } from '@/lib/labels';
import { pickStayDay } from './draft';

export function StayDatesSheet({
  open,
  onClose,
  checkIn,
  nights,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  checkIn: ISODate;
  nights: number;
  onPick: (p: { checkIn: ISODate; nights: number }) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Stay dates">
      {open && <Picker checkIn={checkIn} nights={nights} onPick={onPick} onClose={onClose} />}
    </Sheet>
  );
}

function Picker({ checkIn, nights, onPick, onClose }: { checkIn: ISODate; nights: number; onPick: (p: { checkIn: ISODate; nights: number }) => void; onClose: () => void }) {
  const today = useToday();
  const stays = useStays();
  const blocked = useBlockedDates();
  const [month, setMonth] = useState(monthKey(checkIn));
  const [direction, setDirection] = useState(1);
  // Opens showing the current dates; the first tap picks a new check-in.
  const [picking, setPicking] = useState<{ checkIn: ISODate; checkOut: ISODate | null }>({ checkIn, checkOut: addDays(checkIn, nights) });

  const tap = (day: ISODate) => {
    const next = pickStayDay(picking, day);
    setPicking(next);
    if (next.checkOut) {
      onPick({ checkIn: next.checkIn, nights: nightsBetween(next.checkIn, next.checkOut) });
      onClose();
    }
  };

  const range = { start: picking.checkIn, end: picking.checkOut ?? picking.checkIn };
  const waitingForOut = picking.checkOut === null;

  return (
    <div className="flex flex-col gap-3 pb-2">
      <p className="rounded-2xl bg-haldi px-4 py-3 text-[15px]" aria-live="polite">
        {waitingForOut ? (
          <>
            Check-in <strong className="font-semibold">{formatShortDay(picking.checkIn)}</strong>. Now tap the <strong className="font-semibold">check-out</strong> day.
          </>
        ) : (
          <>
            Tap the <strong className="font-semibold">check-in</strong> day, then the check-out day. Tap the month name to jump ahead.
          </>
        )}
      </p>

      <MonthCalendar
        month={month}
        direction={direction}
        onMonth={(step) => {
          setDirection(step);
          setMonth((m) => addMonths(m, step));
        }}
        onJump={(m) => {
          setDirection(m > month ? 1 : -1);
          setMonth(m);
        }}
        stays={stays.data ?? []}
        blocked={blocked.data ?? []}
        today={today}
        range={range}
        onSelect={tap}
      />

      {waitingForOut && (
        <Button
          block
          variant="outline"
          onClick={() => {
            onPick({ checkIn: picking.checkIn, nights });
            onClose();
          }}
        >
          Keep {plural(nights, 'night')} (out {formatShortDay(addDays(picking.checkIn, nights))})
        </Button>
      )}
    </div>
  );
}
