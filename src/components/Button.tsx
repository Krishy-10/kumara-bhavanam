import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-peacock text-white shadow-[0_6px_18px_-8px_rgba(15,94,90,0.7)] hover:bg-peacock-dark',
  secondary: 'bg-marigold text-teak hover:brightness-105',
  outline: 'border border-line-strong bg-white text-teak hover:bg-haldi',
  ghost: 'text-peacock hover:bg-peacock/5',
  danger: 'border border-terracotta-100 bg-terracotta-50 text-terracotta',
};

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  /** 'lg' is the 60px primary action; 'md' is 48px. */
  size?: 'lg' | 'md';
  icon?: ReactNode;
  children: ReactNode;
  block?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon, children, block, className, disabled, ...rest }: Props) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2.5 font-display font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'lg' ? 'min-h-primary rounded-btn px-6 text-[19px]' : 'min-h-touch rounded-2xl px-5 text-[16px]',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
}
