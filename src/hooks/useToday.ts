import { useEffect, useState } from 'react';
import { todayIST } from '@/lib/dates';

/** Today in Asia/Kolkata, refreshed every minute so it rolls over at midnight IST. */
export function useToday(): string {
  const [today, setToday] = useState(todayIST);
  useEffect(() => {
    const t = window.setInterval(() => setToday(todayIST()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return today;
}
