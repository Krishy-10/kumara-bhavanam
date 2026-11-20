/** Add expense (money spent on the house). Never on a guest's bill; corrected only by voiding. */
import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Chips, DateField, FieldLabel, Group, LabelledChips, MoneyField, TextField } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useAddExpense, useStays } from '@/data/hooks';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { addDays, formatRange, formatShortDay } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { EXPENSE_CATEGORIES, PAYMENT_MODE_LABEL } from '@/lib/labels';
import { useCurrentUser } from '@/session/UserContext';
import { MODES, OfflineNote, SaveError } from '@/screens/Stay/MoneySheets';
import { expenseError, expensePayload, newExpense, type ExpenseDraft } from './expense';

export function ExpenseSheet({ open, onClose, onSaved, stayId }: { open: boolean; onClose: () => void; onSaved: (msg: string) => void; stayId?: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Add expense">
      {/* Remount each time it opens, so the form starts fresh. */}
      {open && <ExpenseForm onClose={onClose} onSaved={onSaved} fixedStayId={stayId} />}
    </Sheet>
  );
}

function ExpenseForm({ onClose, onSaved, fixedStayId }: { onClose: () => void; onSaved: (msg: string) => void; fixedStayId?: string }) {
  const today = useToday();
  const user = useCurrentUser();
  const online = useOnline();
  const stays = useStays();
  const add = useAddExpense();
  const [d, setD] = useState<ExpenseDraft>(() => newExpense(today, fixedStayId));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<ExpenseDraft>) => setD((cur) => ({ ...cur, ...patch }));

  // Stays worth linking: recent or current ones, plus anything already picked.
  const choices = useMemo(
    () =>
      (stays.data ?? [])
        .filter((s) => s.stay_id === d.stayId || (s.status !== 'cancelled' && s.check_in <= addDays(today, 7) && s.check_out >= addDays(today, -60)))
        .sort((a, b) => (a.check_in < b.check_in ? 1 : -1)),
    [stays.data, d.stayId, today],
  );
  const fixedStay = fixedStayId ? stays.data?.find((s) => s.stay_id === fixedStayId) : undefined;
  const error = expenseError(d, today);

  const save = () => {
    setTried(true);
    if (error) return;
    add.mutate(expensePayload(d, user), {
      onSuccess: () => {
        onSaved(`${d.category} · ${formatRupees(d.amount!)} saved`);
        onClose();
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Group label="What for">
        <Chips label="What for" options={EXPENSE_CATEGORIES} value={d.category} onChange={(v) => set({ category: v })} allowClear={false} />
      </Group>
      <MoneyField label="Amount" value={d.amount} onChange={(v) => set({ amount: v })} />
      <Group label="Paid by">
        <LabelledChips label="Paid by" options={MODES} labels={PAYMENT_MODE_LABEL} value={d.mode} onChange={(m) => set({ mode: m })} />
      </Group>
      <DateField label="Paid on" hint={formatShortDay(d.paidOn)} value={d.paidOn} max={today} onChange={(v) => set({ paidOn: v })} />
      <TextField
        label="Note"
        hint={d.category === 'Other' ? 'Needed for Other' : 'Optional'}
        value={d.note}
        onChange={(v) => set({ note: v })}
        placeholder="e.g. October bill"
        maxLength={200}
        autoComplete="off"
      />

      {fixedStayId ? (
        fixedStay && (
          <p className="rounded-2xl bg-haldi px-4 py-3 text-[15px]">
            For <strong className="font-semibold">{fixedStay.guest_name}</strong>’s stay. Not added to their bill.
          </p>
        )
      ) : (
        <div>
          <FieldLabel htmlFor="expense-stay" hint="Optional · never on the guest’s bill">
            For a stay
          </FieldLabel>
          <select
            id="expense-stay"
            value={d.stayId}
            onChange={(e) => set({ stayId: e.target.value })}
            className="min-h-touch w-full rounded-2xl border border-line-strong bg-white px-4 text-[17px] text-teak focus:border-peacock focus:shadow-[0_0_0_4px_rgba(15,94,90,0.12)] focus:outline-none"
          >
            <option value="">The house (no stay)</option>
            {choices.map((s) => (
              <option key={s.stay_id} value={s.stay_id}>
                {s.guest_name} · {formatRange(s.check_in, s.check_out)}
              </option>
            ))}
          </select>
        </div>
      )}

      {tried && error && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {error}
        </p>
      )}
      <SaveError error={add.error} />
      {!online && <OfflineNote />}
      <Button size="lg" block disabled={!online || add.isPending} onClick={save}>
        {add.isPending ? 'Saving…' : d.amount ? `Save ${formatRupees(d.amount)}` : 'Save expense'}
      </Button>
    </div>
  );
}
