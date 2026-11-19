import { isDemo } from '@/config/env';

/** Small "Demo" badge, shown on every screen in demo mode. */
export function DemoBadge() {
  if (!isDemo) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-marigold px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-teak"
      aria-label="Demo version with sample data"
    >
      Demo
    </span>
  );
}
