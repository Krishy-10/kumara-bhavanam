/**
 * "Referred by", shown when Referral is one of the answers to "How they found
 * us". Type a name: referrers already in the shared list are suggested (pick
 * one so their bookings add up in one place), or carry on typing to add a new
 * referrer when the booking is saved. Optional: it can be left blank.
 */
import { TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { useReferrers } from '@/data/hooks';
import type { ReferrerRow } from '@/data/types';
import { formatPhone, normalizePhone } from '@/lib/phone';
import type { ReferrerDraft } from './draft';

const MAX_SUGGESTIONS = 4;

function matches(r: ReferrerRow, q: string): boolean {
  const text = q.trim().toLowerCase();
  if (!text) return false;
  const digits = text.replace(/\D/g, '');
  return r.name.toLowerCase().includes(text) || (digits.length >= 3 && (r.phone ?? '').includes(digits));
}

export function ReferrerField({ draft, set }: { draft: ReferrerDraft; set: (p: Partial<ReferrerDraft>) => void }) {
  const referrers = useReferrers();
  const picked = draft.referrerId ? referrers.data?.find((r) => r.id === draft.referrerId) : undefined;

  if (draft.referrerId) {
    return (
      <div className="fade-in flex items-center gap-3 rounded-card border border-peacock/20 bg-peacock/5 p-4" role="status">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-peacock text-white" aria-hidden="true">
          <Icon name="check" size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] text-muted">Referred by</span>
          <span className="truncate text-[16px] font-semibold">{picked?.name ?? draft.referrerName}</span>
          {picked?.phone && <span className="num text-[14px] text-muted">{formatPhone(picked.phone)}</span>}
        </span>
        <button
          type="button"
          onClick={() => set({ referrerId: null, referrerName: '', referrerPhone: '' })}
          className="min-h-touch shrink-0 rounded-2xl px-3 text-[15px] font-semibold text-peacock underline underline-offset-4"
        >
          Change
        </button>
      </div>
    );
  }

  const suggestions = (referrers.data ?? []).filter((r) => matches(r, draft.referrerName)).slice(0, MAX_SUGGESTIONS);
  const typed = draft.referrerName.trim();
  const exact = suggestions.some((r) => r.name.toLowerCase() === typed.toLowerCase());
  const phoneError = draft.referrerPhone.trim() && !normalizePhone(draft.referrerPhone) ? 'That doesn’t look like a phone number.' : null;

  return (
    <div className="fade-in flex flex-col gap-3 rounded-card border border-line bg-white p-4">
      <TextField
        label="Referred by"
        hint="Optional"
        value={draft.referrerName}
        onChange={(v) => set({ referrerName: v })}
        autoComplete="off"
        autoCapitalize="words"
        placeholder="e.g. Murugan (auto driver)"
      />

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2" role="group" aria-label="Referrers already in your list">
          <p className="text-[13px] text-muted">Already in your list: tap to pick</p>
          {suggestions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => set({ referrerId: r.id, referrerName: r.name, referrerPhone: '' })}
              className="flex min-h-touch items-center justify-between gap-3 rounded-2xl border border-line-strong bg-jasmine px-4 py-2 text-left hover:border-peacock/40"
            >
              <span className="truncate text-[15px] font-semibold">{r.name}</span>
              {r.phone && <span className="num shrink-0 text-[14px] text-muted">{formatPhone(r.phone)}</span>}
            </button>
          ))}
        </div>
      )}

      {typed && exact && <p className="text-[14px] text-muted">That name is already in your list, so this booking will be added to them.</p>}

      {typed && !exact && (
        <>
          <TextField
            label="Their phone"
            hint="Optional, for paying commission"
            value={draft.referrerPhone}
            onChange={(v) => set({ referrerPhone: v })}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="98431 12345"
            error={phoneError}
          />
          <p className="text-[14px] text-muted">New referrer: added to your list when you save this booking.</p>
        </>
      )}
    </div>
  );
}
