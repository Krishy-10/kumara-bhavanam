import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { isDemo, isLocalPreview } from '@/config/env';
import { useUser } from '@/session/UserContext';
import { useOnline } from '@/hooks/useOnline';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

/** "Demo" badge: on every screen in demo mode. */
export function DemoBadge() {
  if (!isDemo) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-marigold px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-teak"
      aria-label="Demo version with sample data"
    >
      Demo
    </span>
  );
}

/**
 * Thin strip at the top of every screen: Demo badge on the left, the picked
 * name and a Switch link on the right.
 */
export function StatusStrip() {
  const { user } = useUser();
  const online = useOnline();
  return (
    <div className="pt-safe">
      {!online && (
        <div role="status" className="bg-teak px-4 py-2 text-center text-[14px] font-medium text-white">
          Offline, read only. Saving is off until you reconnect.
        </div>
      )}
      {isLocalPreview && (
        <div className="bg-haldi px-4 py-1.5 text-center text-[12px] text-muted">
          Local preview: sample data in this browser, resets on reload
        </div>
      )}
      <div className="flex min-h-touch items-center justify-between gap-3 px-[18px]">
        <DemoBadge />
        {user && (
          <span className="flex items-center gap-1 text-[14px] text-muted">
            <span className="max-w-[11rem] truncate">{user}</span>
            <span aria-hidden="true">·</span>
            <Link
              to="/who"
              state={{ switching: true }}
              className="inline-flex min-h-touch items-center px-1 font-semibold text-peacock underline-offset-4 hover:underline"
            >
              Switch
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}

/** Screen wrapper: status strip, a gentle entrance, room for the bottom bar. */
export function Screen({ children, withNav = true, className }: { children: ReactNode; withNav?: boolean; className?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col">
      <StatusStrip />
      {/* CSS entrance (see index.css): the screen can never stay invisible. */}
      <main id="main" className={cx('screen-in flex flex-1 flex-col', withNav && 'pb-[92px]', className)}>
        {children}
      </main>
      {withNav && <BottomNav />}
    </div>
  );
}

/** Back arrow and title for screens below the tabs. */
export function SubHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2 px-2.5 pb-2 pt-1">
      <button
        type="button"
        onClick={onBack ?? (() => navigate(-1))}
        aria-label="Back"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-teak hover:bg-line/60"
      >
        <Icon name="back" size={24} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="line-clamp-2 break-words text-[22px] font-bold leading-tight">{title}</h1>
        {subtitle && <span className="text-[14px] leading-snug text-muted">{subtitle}</span>}
      </div>
      {right}
    </header>
  );
}

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/stays', label: 'Stays', icon: 'calendar' },
  { to: '/guests', label: 'Guests', icon: 'guests' },
  { to: '/ledger', label: 'Ledger', icon: 'rupee' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-app border-t border-line bg-white/95 pb-safe backdrop-blur"
    >
      <ul className="flex justify-around pt-1.5">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'relative mx-auto flex min-h-[52px] max-w-[88px] flex-col items-center justify-center gap-0.5 text-[12px]',
                  isActive ? 'font-semibold text-peacock' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-x-2 top-0 h-[30px] rounded-full bg-peacock/10"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative grid h-[30px] place-items-center">
                    <Icon name={t.icon} size={23} />
                  </span>
                  <span className="relative">{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-card bg-line/70', className)} aria-hidden="true" />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-[18px] rounded-card border border-terracotta-100 bg-terracotta-50 p-4 text-[15px] text-terracotta">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 min-h-touch font-semibold underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}
