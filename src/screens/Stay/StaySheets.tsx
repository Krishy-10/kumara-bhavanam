/** Status menu, check-out warning and the ID-checked register for a stay. */
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Group, LabelledChips, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useSaveIdCheck, useSetStatus } from '@/data/hooks';
import type { DocType, StayRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { formatRupees } from '@/lib/format';
import { DOC_TYPE_LABEL, STATUS_LABEL, plural } from '@/lib/labels';
import type { StayStatus } from '@/lib/money';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/session/UserContext';

interface Move {
  to: StayStatus;
  label: string;
  hint?: string;
  danger?: boolean;
}

/** Where a stay can go from each status. */
export const STATUS_MOVES: Record<StayStatus, Move[]> = {
  enquiry: [
    { to: 'tentative', label: 'Mark tentative', hint: 'Holding the dates, not yet sure' },
    { to: 'confirmed', label: 'Confirm booking', hint: 'Dates are taken' },
    { to: 'cancelled', label: 'Cancel', danger: true },
  ],
  tentative: [
    { to: 'confirmed', label: 'Confirm booking', hint: 'Dates are taken' },
    { to: 'enquiry', label: 'Back to enquiry' },
    { to: 'cancelled', label: 'Cancel booking', danger: true },
  ],
  confirmed: [
    { to: 'checked_in', label: 'Check in', hint: 'The group has arrived' },
    { to: 'tentative', label: 'Back to tentative', hint: 'Frees the dates for others' },
    { to: 'cancelled', label: 'Cancel booking', danger: true },
  ],
  checked_in: [
    { to: 'completed', label: 'Check out', hint: 'The group has left' },
    { to: 'confirmed', label: 'Undo check-in' },
  ],
  completed: [{ to: 'checked_in', label: 'Reopen', hint: 'Back to checked in' }],
  cancelled: [{ to: 'enquiry', label: 'Restore as enquiry', hint: 'Then confirm again if the dates are still free' }],
};

export function StatusSheet({
  stay,
  open,
  onClose,
  onPick,
}: {
  stay: StayRow;
  open: boolean;
  onClose: () => void;
  /** The screen decides what happens (check-out warning, cancel confirm). */
  onPick: (to: StayStatus) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`${STATUS_LABEL[stay.status]} · change to`}>
      <ul className="flex flex-col gap-2.5 pb-2">
        {STATUS_MOVES[stay.status].map((m) => (
          <li key={m.to}>
            <button
              type="button"
              onClick={() => onPick(m.to)}
              className={cx(
                'flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left transition-colors',
                m.danger ? 'border-terracotta-100 bg-terracotta-50 text-terracotta' : 'border-line bg-white hover:bg-haldi',
              )}
            >
              <span className="flex flex-col">
                <span className="text-[17px] font-semibold">{m.label}</span>
                {m.hint && <span className={cx('text-[14px]', m.danger ? 'text-terracotta' : 'text-muted')}>{m.hint}</span>}
              </span>
              <Icon name="chevron" size={20} className="shrink-0 opacity-60" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/**
 * Asks before a step that's easy to regret: cancelling, checking out with money
 * due, or checking in or out with checklist items unticked. Only cancelling
 * needs a firm yes; the rest are warnings and can go ahead.
 */
export function ConfirmMove({
  stay,
  to,
  checklistLeft = 0,
  onClose,
  onDone,
  onAddPayment,
  onShowChecklist = onClose,
}: {
  stay: StayRow;
  to: StayStatus | null;
  /** Unticked items on the list for this move (before check-in, or at check-out). */
  checklistLeft?: number;
  onClose: () => void;
  onDone: (to: StayStatus) => void;
  onAddPayment: () => void;
  onShowChecklist?: () => void;
}) {
  const set = useSetStatus();
  const online = useOnline();
  const go = () => set.mutate({ stayId: stay.stay_id, status: to! }, { onSuccess: () => onDone(to!) });
  const cancel = to === 'cancelled';
  const due = to === 'completed' && stay.balance > 0;
  const unticked = (to === 'completed' || to === 'checked_in') && checklistLeft > 0;
  const step = to === 'checked_in' ? 'check in' : 'check out';
  const title = cancel ? 'Cancel this booking?' : due ? 'Balance still due' : 'Checklist not finished';
  return (
    <Sheet open={to !== null} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 pb-2">
        {cancel ? (
          <p className="text-[16px]">
            The dates become free for others. Payments stay on record{stay.net_paid > 0 ? ` (${formatRupees(stay.net_paid)} received)` : ''}; if you return money, add it as a
            refund.
          </p>
        ) : (
          <>
            {due && (
              <p className="text-[16px]">
                <span className="num font-bold text-terracotta">{formatRupees(stay.balance)}</span> is still due from {stay.guest_name}. You can check out anyway and collect it
                later; it will show under To collect on Home.
              </p>
            )}
            {unticked && (
              <p className="flex gap-2.5 rounded-2xl bg-haldi px-4 py-3 text-[15px] text-teak">
                <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-marigold" />
                <span>
                  {plural(checklistLeft, 'item')} on the {to === 'checked_in' ? 'before check-in' : 'check-out'} checklist {checklistLeft === 1 ? 'isn’t' : 'aren’t'} ticked. You can{' '}
                  {step} anyway.
                </span>
              </p>
            )}
          </>
        )}
        {set.error && (
          <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
            {set.error.message}
          </p>
        )}
        {due && (
          <Button size="lg" block onClick={onAddPayment}>
            Add payment first
          </Button>
        )}
        <Button size="lg" block variant={cancel ? 'danger' : due ? 'outline' : 'primary'} disabled={!online || set.isPending} onClick={go}>
          {set.isPending ? 'Saving…' : cancel ? 'Yes, cancel it' : to === 'checked_in' ? 'Check in anyway' : 'Check out anyway'}
        </Button>
        {cancel ? (
          <Button block variant="ghost" onClick={onClose}>
            Keep the booking
          </Button>
        ) : (
          unticked && (
            <Button block variant="ghost" onClick={onShowChecklist}>
              Go to the checklist
            </Button>
          )
        )}
      </div>
    </Sheet>
  );
}

const DOCS: readonly DocType[] = ['aadhaar', 'passport', 'driving_licence', 'voter_id', 'other'];

/** Records that an ID was seen. Only the type and, optionally, the last 4 characters. */
export function IdCheckSheet({ stayId, open, onClose, onSaved }: { stayId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="ID checked">
      {open && <IdCheckForm stayId={stayId} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function IdCheckForm({ stayId, onClose, onSaved }: { stayId: string; onClose: () => void; onSaved: () => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const save = useSaveIdCheck(stayId);
  const [doc, setDoc] = useState<DocType>('aadhaar');
  const [last4, setLast4] = useState('');
  const clean = last4.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const last4Error = clean.length > 0 && clean.length !== 4 ? 'Exactly 4 letters or digits, or leave it empty.' : null;

  return (
    <div className="flex flex-col gap-5">
      <Group label="Which ID did you see?">
        <LabelledChips label="ID type" options={DOCS} labels={DOC_TYPE_LABEL} value={doc} onChange={setDoc} />
      </Group>
      <TextField
        label="Last 4 characters"
        hint="Optional"
        value={last4}
        onChange={(v) => setLast4(v.replace(/[^A-Za-z0-9]/g, '').slice(0, 4))}
        inputMode={doc === 'aadhaar' ? 'numeric' : 'text'}
        autoComplete="off"
        maxLength={4}
        placeholder="e.g. 4821"
        error={last4Error}
      />
      <p className="rounded-2xl bg-haldi p-3 text-[14px] text-teak">
        Only the last 4 are kept. Never type a full ID number, and don’t photograph the card. This records that you looked at the ID; it is not Aadhaar verification.
      </p>
      {save.error && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {save.error.message}
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={!!last4Error || !online || save.isPending}
        onClick={() =>
          save.mutate(
            { docType: doc, last4: clean.length === 4 ? clean : null, by: user },
            {
              onSuccess: () => {
                onSaved();
                onClose();
              },
            },
          )
        }
      >
        {save.isPending ? 'Saving…' : 'Mark ID checked'}
      </Button>
    </div>
  );
}
