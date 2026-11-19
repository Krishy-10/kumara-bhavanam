import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Chips, FieldLabel, Group, MoneyField, Segmented, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { initials } from '@/config/users';
import type { PaymentMode } from '@/data/types';
import { formatRange, formatShortDay } from '@/lib/dates';
import { formatRupees, formatSigned } from '@/lib/format';
import { DISCOUNT_LABELS, EXTRA_LABELS, PAYMENT_MODE_LABEL, plural } from '@/lib/labels';
import { baseAmount, type ChargeKind, type PricingMode } from '@/lib/money';
import { checkOutOf, draftPricing, type Draft, type DraftLine } from './draft';

const MODES: PaymentMode[] = ['upi', 'cash', 'bank_transfer', 'card', 'other'];

export function StepPrice({ draft, set, returning }: { draft: Draft; set: (p: Partial<Draft>) => void; returning: boolean }) {
  const [adding, setAdding] = useState<ChargeKind | null>(null);
  const dateId = useId();

  const switchMode = (mode: PricingMode) => {
    if (mode === draft.pricingMode) return;
    // Switching to fixed starts from what per-night would have come to.
    if (mode === 'fixed' && draft.fixedAmount === null) {
      set({ pricingMode: mode, fixedAmount: baseAmount({ ...draftPricing(draft), pricing_mode: 'per_night' }) });
    } else {
      set({ pricingMode: mode });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5">
        <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marigold text-[15px] font-bold">{initials(draft.name || '?')}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold">{draft.name}</span>
          <span className="text-[14px] text-muted">
            {formatRange(draft.checkIn, checkOutOf(draft))} · {plural(draft.nights, 'night')} · {plural(draft.guestsCount, 'guest')}
          </span>
        </span>
        {returning && <span className="rounded-full bg-peacock/10 px-2.5 py-1 text-[12px] font-semibold text-peacock">Returning</span>}
      </div>

      <Group label="How is this stay priced?">
        <div className="flex flex-col gap-3">
          <Segmented<PricingMode>
            label="Pricing"
            name="pricing"
            value={draft.pricingMode}
            onChange={switchMode}
            options={[
              { value: 'per_night', label: 'Per night' },
              { value: 'fixed', label: 'Fixed for stay' },
            ]}
          />
          {draft.pricingMode === 'per_night' ? (
            <MoneyField label="Rate per night" value={draft.nightlyRate} onChange={(v) => set({ nightlyRate: v, rateTouched: true })} hint="Last rate used" />
          ) : (
            <MoneyField label="Amount for the whole stay" value={draft.fixedAmount} onChange={(v) => set({ fixedAmount: v })} hint={plural(draft.nights, 'night')} />
          )}
        </div>
      </Group>

      <Group label="Extras and discounts" hint="Optional">
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {draft.lines.map((l) => (
              <motion.li
                key={l.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center justify-between gap-2 border-b border-line py-1"
              >
                <span className="text-[16px]">{l.label}</span>
                <span className="flex items-center gap-1">
                  <span className={`num text-[17px] font-semibold ${l.kind === 'discount' ? 'text-peacock' : ''}`}>
                    {formatSigned(l.amount, l.kind === 'discount' ? '−' : '+')}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.label}`}
                    onClick={() => set({ lines: draft.lines.filter((x) => x.id !== l.id) })}
                    className="grid h-12 w-12 place-items-center rounded-full text-muted hover:bg-line/60"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <AnimatePresence mode="wait" initial={false}>
          {adding ? (
            <LineEditor
              key={adding}
              kind={adding}
              onCancel={() => setAdding(null)}
              onAdd={(line) => {
                set({ lines: [...draft.lines, line] });
                setAdding(null);
              }}
            />
          ) : (
            <motion.div key="buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 grid grid-cols-2 gap-2.5">
              <Button variant="outline" onClick={() => setAdding('charge')}>
                + Add extra
              </Button>
              <Button variant="outline" onClick={() => setAdding('discount')}>
                + Add discount
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Group>

      <Group label="Advance received" hint="Optional">
        <div className="flex flex-col gap-3">
          <MoneyField label="Advance amount" compact value={draft.advance} onChange={(v) => set({ advance: v })} />
          <AnimatePresence initial={false}>
            {(draft.advance ?? 0) > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-3 overflow-hidden">
                <Chips label="Paid by" options={MODES.map((m) => PAYMENT_MODE_LABEL[m])} value={PAYMENT_MODE_LABEL[draft.advanceMode]} allowClear={false}
                  onChange={(label) => set({ advanceMode: MODES.find((m) => PAYMENT_MODE_LABEL[m] === label) ?? 'upi' })} />
                <div>
                  <FieldLabel htmlFor={dateId} hint={formatShortDay(draft.advanceOn)}>
                    Received on
                  </FieldLabel>
                  <input
                    id={dateId}
                    type="date"
                    value={draft.advanceOn}
                    onChange={(e) => e.target.value && set({ advanceOn: e.target.value })}
                    className="num min-h-touch w-full rounded-2xl border border-line-strong bg-white px-4 text-[17px] focus:border-peacock focus:outline-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Group>
    </div>
  );
}

function LineEditor({ kind, onAdd, onCancel }: { kind: ChargeKind; onAdd: (l: DraftLine) => void; onCancel: () => void }) {
  const options = kind === 'charge' ? EXTRA_LABELS : DISCOUNT_LABELS;
  const [choice, setChoice] = useState<string | null>(options[0]);
  const [custom, setCustom] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  // Discount labels must come from the fixed list; extras can be named freely.
  const label = kind === 'charge' && choice === 'Other' ? custom.trim() : choice;
  const ok = !!label && (amount ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mt-3 flex flex-col gap-3 rounded-card border border-line bg-haldi/60 p-4"
    >
      <span className="text-[15px] font-semibold">{kind === 'charge' ? 'Add an extra' : 'Add a discount'}</span>
      <Chips label={kind === 'charge' ? 'Extra' : 'Discount'} options={options} value={choice as (typeof options)[number]} onChange={setChoice} allowClear={false} />
      {kind === 'charge' && choice === 'Other' && <TextField label="What for" value={custom} onChange={setCustom} placeholder="e.g. Extra cooking gas" />}
      <MoneyField label="Amount" value={amount} onChange={setAmount} />
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!ok}
          onClick={() => ok && onAdd({ id: crypto.randomUUID(), kind, label: label!, amount: amount! })}
        >
          Add {amount ? formatRupees(amount) : ''}
        </Button>
      </div>
    </motion.div>
  );
}
