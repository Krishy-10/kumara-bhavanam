import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router';
import { APP_USERS, initials, type AppUser } from '@/config/users';
import { StatusStrip } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { useUser } from '@/session/UserContext';
import { cx } from '@/lib/cx';
import balcony from '@/assets/photos/balcony.webp';
import bedroom from '@/assets/photos/bedroom.webp';
import hall from '@/assets/photos/hall.webp';

const AVATAR = ['bg-peacock text-white', 'bg-marigold text-teak'];

/** "Who's using this?": attribution, not security. Every insert records this name. */
export function Picker() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const choose = (u: AppUser) => {
    setUser(u);
    navigate(from, { replace: true });
  };

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-app flex-col overflow-hidden">
      {/* The floor itself, very faint, behind everything. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid h-[62%] grid-cols-2 grid-rows-[1.2fr_1fr] gap-1.5 opacity-[0.22] saturate-[0.85]">
          <img src={balcony} alt="" className="col-span-2 h-full w-full object-cover" />
          <img src={bedroom} alt="" className="h-full w-full object-cover" />
          <img src={hall} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-jasmine/30 via-jasmine/85 to-jasmine" />
      </div>

      <StatusStrip />

      <main className="flex flex-1 flex-col justify-end px-[22px] pb-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mb-7"
        >
          <p className="text-[15px] text-muted">வணக்கம் · Kumara Bhavanam</p>
          <h1 className="mt-1 text-[34px] font-bold leading-[1.05] tracking-tight">Who’s using this?</h1>
          <p className="mt-2 text-[16px] text-muted">Pick your name. It’s saved on every booking and payment you enter on this phone.</p>
        </motion.div>

        <ul className="flex flex-col gap-3.5">
          {APP_USERS.map((name, i) => {
            const current = name === user;
            return (
              <motion.li
                key={name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => choose(name)}
                  className={cx(
                    'flex min-h-[96px] w-full items-center gap-4 rounded-hero border bg-white/90 px-5 text-left shadow-[0_10px_30px_-18px_rgba(43,29,20,0.45)] backdrop-blur-sm transition-colors',
                    current ? 'border-peacock' : 'border-line hover:border-peacock/40',
                  )}
                >
                  <span className={cx('num grid h-14 w-14 shrink-0 place-items-center rounded-full text-[20px] font-bold', AVATAR[i % 2])}>
                    {initials(name)}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-display text-[22px] font-semibold leading-tight">{name}</span>
                    <span className="text-[14px] text-muted">{current ? 'Using this phone now' : 'Tap to continue'}</span>
                  </span>
                  <Icon name="chevron" className="text-muted" />
                </motion.button>
              </motion.li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
