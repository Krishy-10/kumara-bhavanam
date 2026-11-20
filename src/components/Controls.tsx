/**
 * Form controls sized for thumbs: every target is at least 48px, inputs use
 * 16px+ text (no zoom on Android), and each control has a real label.
 */
import { motion } from 'motion/react';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { formatRupees, parseRupees } from '@/lib/format';
import { Icon } from './Icon';

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[15px] font-semibold text-teak">
        {children}
      </label>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}

/** A titled group for controls that aren't a single input (segmented, chips). */
export function Group({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span id={id} className="text-[15px] font-semibold text-teak">
          {label}
        </span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputBase =
  'w-full min-h-touch rounded-2xl border border-line-strong bg-white px-4 text-[17px] text-teak placeholder:text-muted/60 ' +
  'transition-shadow focus:border-peacock focus:shadow-[0_0_0_4px_rgba(15,94,90,0.12)] focus:outline-none';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'prefix'> {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  prefix?: ReactNode;
}

export function TextField({ label, hint, value, onChange, error, prefix, className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errId = `${fieldId}-err`;
  return (
    <div className={className}>
      <FieldLabel htmlFor={fieldId} hint={hint}>
        {label}
      </FieldLabel>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center num text-[17px] text-muted">{prefix}</span>}
        <input
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className={cx(inputBase, prefix ? 'pl-[4.25rem]' : '', error && 'border-terracotta')}
          {...rest}
        />
      </div>
      {error && (
        <p id={errId} className="mt-1.5 text-[14px] text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

/** Whole-rupee input: shows "5,000", stores 5000. Never accepts fractions. */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  id,
  className,
  compact,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: ReactNode;
  id?: string;
  className?: string;
  compact?: boolean;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [text, setText] = useState(value === null ? '' : formatRupees(value).replace('₹', ''));
  const [lastValue, setLastValue] = useState(value);
  // Follow outside changes (e.g. a default filled in) without fighting the typist.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseRupees(text) !== value) setText(value === null ? '' : formatRupees(value).replace('₹', ''));
  }
  return (
    <div className={className}>
      {!compact && (
        <FieldLabel htmlFor={fieldId} hint={hint}>
          {label}
        </FieldLabel>
      )}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center num text-[18px] text-muted">₹</span>
        <input
          id={fieldId}
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          aria-label={compact ? label : undefined}
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 8);
            const n = raw === '' ? null : Number(raw);
            setText(n === null ? '' : formatRupees(n).replace('₹', ''));
            setLastValue(n);
            onChange(n);
          }}
          className={cx(inputBase, 'num pl-9 text-[19px] font-semibold')}
        />
      </div>
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/** Two to four mutually exclusive choices with a sliding highlight. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  name,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[18px] border border-line bg-white p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={typeof o.label === 'string' ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative min-h-touch flex-1 rounded-[14px] px-3 text-[16px] font-semibold transition-colors',
              active ? 'text-white' : 'text-muted hover:text-teak',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${name}`}
                className="absolute inset-0 rounded-[14px] bg-peacock"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pill choices; single-select, tap again to clear when `allowClear`. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  allowClear = true,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o === value;
        return (
          <motion.button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(active && allowClear ? null : o)}
            className={cx(
              'min-h-touch rounded-full border px-4 text-[15px] font-medium transition-colors',
              active ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-teak hover:border-peacock/40',
            )}
          >
            {o}
          </motion.button>
        );
      })}
    </div>
  );
}

/**
 * Pick any number of options. Each chip is a toggle button (aria-pressed);
 * a picked chip shows a tick as well as its colour, so meaning never rests on
 * colour alone.
 */
export function MultiChips<T extends string>({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  value: readonly string[];
  onToggle: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <motion.button
            key={o}
            type="button"
            aria-pressed={active}
            whileTap={{ scale: 0.95 }}
            onClick={() => onToggle(o)}
            className={cx(
              'inline-flex min-h-touch items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors',
              active ? 'border-peacock bg-peacock pl-3 text-white' : 'border-line-strong bg-white text-teak hover:border-peacock/40',
            )}
          >
            {active && <Icon name="check" size={18} />}
            {o}
          </motion.button>
        );
      })}
    </div>
  );
}

/** − n + with 48px buttons. */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  format?: (n: number) => ReactNode;
}) {
  const btn =
    'grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-white text-teak transition-colors hover:bg-haldi disabled:opacity-35';
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
        <Icon name="minus" />
      </button>
      <motion.output
        key={value}
        initial={{ scale: 0.85, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        className="num min-w-[4ch] text-center text-[24px] font-bold"
        aria-live="polite"
        aria-label={`${label}: ${value}`}
      >
        {format ? format(value) : value}
      </motion.output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

/** On/off switch with its label on the left. */
export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-touch w-full items-center justify-between gap-4 rounded-2xl text-left"
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-8 w-14 shrink-0 rounded-full transition-colors', checked ? 'bg-peacock' : 'bg-line-strong')}>
        <motion.span
          className="absolute top-1 h-6 w-6 rounded-full bg-white shadow"
          animate={{ left: checked ? 28 : 4 }}
          transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        />
      </span>
    </button>
  );
}

/** Native date picker (the phone's own calendar), with the weekday as a hint. */
export function DateField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  min?: string;
  max?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className={cx(inputBase, 'num text-[18px] font-semibold')}
      />
    </div>
  );
}

/** Multi-line text, same look as TextField. */
export function TextArea({
  label,
  hint,
  value,
  onChange,
  rows = 4,
  placeholder,
  className,
  error,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputBase, 'py-3 leading-relaxed', error && 'border-terracotta')}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[14px] text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

/** Pick one of several coded values shown with friendly labels. */
export function LabelledChips<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o === value;
        return (
          <motion.button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(o)}
            className={cx(
              'min-h-touch rounded-full border px-4 text-[15px] font-medium transition-colors',
              active ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-teak hover:border-peacock/40',
            )}
          >
            {labels[o]}
          </motion.button>
        );
      })}
    </div>
  );
}
