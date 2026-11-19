/** One guest: contact, past stays, total spent, notes. Archived, never deleted. */
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { Group, Segmented, TextArea, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { StayItem } from '@/components/StayItem';
import { Toast, useToast } from '@/components/Toast';
import { useGuests, useSetGuestArchived, useStays, useUpdateGuest } from '@/data/hooks';
import type { GuestRow, Language } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { useToday } from '@/hooks/useToday';
import { formatMonthShort, monthKey } from '@/lib/dates';
import { formatRupees } from '@/lib/format';
import { formatPhone, waNumber } from '@/lib/phone';
import { summarise } from '@/lib/guests';

export function GuestPage() {
  const { guestId = '' } = useParams();
  const guests = useGuests();
  const stays = useStays();
  const guest = guests.data?.find((g) => g.id === guestId);
  const error = guests.error ?? stays.error;

  if (error) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Guest" />
        <ErrorState message={error.message} onRetry={() => void Promise.all([guests.refetch(), stays.refetch()])} />
      </Screen>
    );
  }
  if (!guests.data || !stays.data) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Guest" />
        <div className="flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      </Screen>
    );
  }
  if (!guest) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Guest" />
        <ErrorState message="This guest isn’t here." />
      </Screen>
    );
  }
  return <GuestBody guest={guest} />;
}

function GuestBody({ guest }: { guest: GuestRow }) {
  const today = useToday();
  const navigate = useNavigate();
  const online = useOnline();
  const stays = useStays();
  const archive = useSetGuestArchived();
  const { toast, show, hide } = useToast();
  const [editing, setEditing] = useState(false);
  const sum = summarise(guest.id, stays.data ?? []);
  const lastPast = sum.stays.find((s) => s.status !== 'cancelled' && s.check_in < today);

  return (
    <Screen withNav={false}>
      <SubHeader
        title={guest.name}
        subtitle={[guest.city, guest.archived_at ? 'Archived' : null].filter(Boolean).join(' · ') || undefined}
        right={
          <button type="button" onClick={() => setEditing(true)} className="mr-2 grid h-12 w-12 place-items-center rounded-full text-peacock hover:bg-peacock/5" aria-label="Edit guest details">
            <Icon name="edit" />
          </button>
        }
      />

      <div className="mx-4 mt-1 grid grid-cols-3 gap-2">
        <a href={`tel:${guest.phone}`} className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-white text-[14px] font-semibold text-peacock">
          <Icon name="phone" size={20} />
          Call
        </a>
        <a
          href={`https://wa.me/${waNumber(guest.phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-white text-[14px] font-semibold text-peacock"
        >
          <Icon name="chat" size={20} />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => navigate('/book', { state: { phone: guest.phone, checkIn: today } })}
          disabled={!!guest.archived_at}
          className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl bg-peacock text-[14px] font-semibold text-white disabled:opacity-45"
        >
          <Icon name="plus" size={20} />
          New booking
        </button>
      </div>

      <dl className="mx-4 mt-3 grid grid-cols-3 gap-2" aria-label="Summary">
        <Stat label="Stays" value={String(sum.visits)} />
        <Stat label="Spent" value={formatRupees(sum.spent)} />
        <Stat label="Last stay" value={lastPast ? formatMonthShort(monthKey(lastPast.check_in)) : '—'} />
      </dl>

      <section aria-label="Details" className="mx-4 mt-3 rounded-card border border-line bg-white px-4 py-1">
        <dl className="divide-y divide-line text-[15px]">
          <Detail k="Phone" v={<span className="num">{formatPhone(guest.phone)}</span>} />
          <Detail k="Email" v={guest.email ?? '—'} />
          <Detail k="Messages in" v={guest.language === 'ta' ? 'தமிழ் (Tamil)' : 'English'} />
          <Detail k="Nationality" v={guest.nationality} />
          <div className="py-3">
            <dt className="text-muted">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{guest.notes || <span className="text-muted">No notes. Tap the pencil to add some.</span>}</dd>
          </div>
        </dl>
      </section>

      <section className="mx-4 mt-5" aria-labelledby="gstays">
        <h2 id="gstays" className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          Stays
        </h2>
        {sum.stays.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong bg-white p-5 text-center text-[15px] text-muted">No stays yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {sum.stays.map((s) => (
              <li key={s.stay_id}>
                <StayItem stay={s} year={today.slice(0, 4)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mx-4 mb-6 mt-6">
        <Button
          variant="outline"
          block
          disabled={!online || archive.isPending}
          onClick={() =>
            archive.mutate(
              { id: guest.id, archived: !guest.archived_at },
              { onSuccess: () => show({ text: guest.archived_at ? 'Guest restored' : 'Guest archived. Their stays are kept.' }) },
            )
          }
        >
          {guest.archived_at ? 'Restore guest' : 'Archive guest'}
        </Button>
        <p className="mt-2 text-center text-[13px] text-muted">
          Guests are never deleted. Archiving hides them from the list; their stays and bills stay as they are.
        </p>
      </div>

      <EditGuestSheet guest={guest} open={editing} onClose={() => setEditing(false)} onSaved={() => show({ text: 'Guest updated' })} />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-white px-3 py-2.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="num truncate text-[18px] font-bold">{value}</dd>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 truncate text-right">{v}</dd>
    </div>
  );
}

function EditGuestSheet({ guest, open, onClose, onSaved }: { guest: GuestRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Edit guest">
      {open && <EditGuestForm guest={guest} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function EditGuestForm({ guest, onClose, onSaved }: { guest: GuestRow; onClose: () => void; onSaved: () => void }) {
  const update = useUpdateGuest();
  const online = useOnline();
  const [name, setName] = useState(guest.name);
  const [city, setCity] = useState(guest.city ?? '');
  const [email, setEmail] = useState(guest.email ?? '');
  const [notes, setNotes] = useState(guest.notes ?? '');
  const [language, setLanguage] = useState<Language>(guest.language);
  const emailError = email.trim() && !email.includes('@') ? 'That doesn’t look like an email address.' : null;
  const valid = name.trim().length > 0 && !emailError;

  return (
    <div className="flex flex-col gap-5">
      <TextField label="Name" value={name} onChange={setName} autoCapitalize="words" autoComplete="off" />
      <TextField label="City" hint="Optional" value={city} onChange={setCity} autoCapitalize="words" autoComplete="off" />
      <TextField label="Email" hint="Optional" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="off" error={emailError} />
      <Group label="Messages in">
        <Segmented
          label="Language for messages"
          name="edit-lang"
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ta', label: 'தமிழ்' },
          ]}
        />
      </Group>
      <TextArea label="Notes" hint="Optional" value={notes} onChange={setNotes} rows={3} placeholder="e.g. Prefers ground-floor parking, vegetarian" />
      <p className="text-[13px] text-muted">The phone number can’t be changed here: it’s how the app finds this guest. Never write ID numbers in notes.</p>
      {update.error && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {update.error.message}
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={!valid || !online || update.isPending}
        onClick={() =>
          update.mutate(
            { id: guest.id, edit: { name: name.trim(), city: city.trim() || null, email: email.trim() || null, notes: notes.trim() || null, language } },
            {
              onSuccess: () => {
                onSaved();
                onClose();
              },
            },
          )
        }
      >
        {update.isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
