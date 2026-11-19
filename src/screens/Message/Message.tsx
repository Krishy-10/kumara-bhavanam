/**
 * Message guest: pick a thank-you or review-request template, read and edit
 * the draft, then open WhatsApp / email or copy it. Nothing sends by itself.
 * Review requests never mention a discount, offer or gift (checked here on
 * the draft and on save, and by the database for templates).
 */
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/Button';
import { Group, Segmented, TextArea, TextField } from '@/components/Controls';
import { Icon } from '@/components/Icon';
import { ErrorState, Screen, Skeleton, SubHeader } from '@/components/Layout';
import { Toast, useToast } from '@/components/Toast';
import { useArchiveTemplate, useGuests, useSetGuestLanguage, useSetReviewLink, useSettings, useStays, useTemplates } from '@/data/hooks';
import type { GuestRow, Language, SettingsRow, StayRow, TemplateKind, TemplateRow } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { formatPhone, waNumber } from '@/lib/phone';
import { copyText, mailtoUrl, whatsAppUrl } from '@/lib/share';
import { fillTemplate, guestFirstName, incentiveWord, REVIEW_LINK_PLACEHOLDER } from '@/lib/templates';
import { cx } from '@/lib/cx';
import { TemplateSheet } from './TemplateSheet';

export function Message() {
  const { stayId = '' } = useParams();
  const stays = useStays();
  const guests = useGuests();
  const templates = useTemplates();
  const settings = useSettings();
  const stay = stays.data?.find((s) => s.stay_id === stayId);
  const guest = guests.data?.find((g) => g.id === stay?.guest_id);
  const error = stays.error ?? guests.error ?? templates.error ?? settings.error;

  if (error) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Message guest" />
        <ErrorState message={error.message} />
      </Screen>
    );
  }
  if (!stays.data || !guests.data || !templates.data || !settings.data) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Message guest" />
        <div className="flex flex-col gap-3 px-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-12" />
          <Skeleton className="h-64" />
        </div>
      </Screen>
    );
  }
  if (!stay || !guest) {
    return (
      <Screen withNav={false}>
        <SubHeader title="Message guest" />
        <ErrorState message="This stay isn’t here." />
      </Screen>
    );
  }
  return <Composer stay={stay} guest={guest} templates={templates.data} settings={settings.data} />;
}

function Composer({ stay, guest, templates, settings }: { stay: StayRow; guest: GuestRow; templates: TemplateRow[]; settings: SettingsRow }) {
  const [params, setParams] = useSearchParams();
  const kind: TemplateKind = params.get('kind') === 'review_request' ? 'review_request' : 'thank_you';
  const [language, setLanguage] = useState<Language>(guest.language);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // A template just saved is picked by name once the list refreshes.
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = untouched, follow the template
  const [adding, setAdding] = useState(false);
  const setLang = useSetGuestLanguage();
  const archive = useArchiveTemplate();
  const { toast, show, hide } = useToast();

  const options = useMemo(() => templates.filter((t) => t.kind === kind && t.language === language), [templates, kind, language]);
  const picked =
    options.find((t) => t.id === pickedId) ?? (newTitle ? options.filter((t) => t.title === newTitle).at(-1) : undefined) ?? options[0] ?? null;
  const filled = picked
    ? fillTemplate(picked.body, { guestName: stay.guest_name, occasion: stay.occasion, nights: stay.nights, reviewLink: settings.google_review_link })
    : '';
  const text = draft ?? filled;
  const bad = kind === 'review_request' ? incentiveWord(text) : null;
  const missingLink = text.includes(REVIEW_LINK_PLACEHOLDER);
  const empty = text.trim().length === 0;

  const changeKind = (k: TemplateKind) => {
    setParams({ kind: k }, { replace: true });
    setPickedId(null);
    setDraft(null);
  };
  const changeLanguage = (l: Language) => {
    setLanguage(l);
    setPickedId(null);
    setDraft(null);
    // Remember the guest's language for next time.
    if (l !== guest.language) setLang.mutate({ id: guest.id, language: l });
  };
  const pick = (t: TemplateRow) => {
    setPickedId(t.id);
    setNewTitle(null);
    setDraft(null);
  };

  const subject = kind === 'review_request' ? `Your stay at ${settings.property_name}` : `Thank you from ${settings.property_name}`;
  const blocked = !!bad || empty;

  return (
    <Screen withNav={false}>
      <SubHeader title={`Message ${guestFirstName(stay.guest_name)}`} subtitle={<span className="num">{formatPhone(guest.phone)}</span>} />

      <div className="flex flex-col gap-4 px-4 pb-6">
        <Segmented<TemplateKind>
          label="Kind of message"
          name="msg-kind"
          value={kind}
          onChange={changeKind}
          options={[
            { value: 'thank_you', label: 'Thank you' },
            { value: 'review_request', label: 'Review request' },
          ]}
        />

        <Group label="Language" hint={language === guest.language ? 'Remembered for this guest' : undefined}>
          <Segmented<Language>
            label="Language"
            name="msg-lang"
            value={language}
            onChange={changeLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ta', label: 'தமிழ்' },
            ]}
          />
        </Group>

        <Group label="Template">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Template">
            {options.map((t) => {
              const active = picked?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pick(t)}
                  className={cx(
                    'min-h-touch shrink-0 rounded-full border px-4 text-[15px] font-medium transition-colors',
                    active ? 'border-peacock bg-peacock text-white' : 'border-line-strong bg-white text-teak',
                  )}
                >
                  {t.title}
                  {!t.is_preset && <span className="ml-1.5 text-[12px] opacity-80">· yours</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-touch shrink-0 items-center gap-1.5 rounded-full border border-dashed border-peacock px-4 text-[15px] font-semibold text-peacock"
            >
              <Icon name="plus" size={18} />
              New template
            </button>
          </div>
        </Group>

        {options.length === 0 && (
          <p className="rounded-2xl bg-haldi p-4 text-[15px]">
            {language === 'ta'
              ? 'No Tamil templates yet. Tap “New template” to write one; it will be saved for both phones.'
              : 'No templates of this kind yet. Tap “New template” to write one.'}
          </p>
        )}

        {kind === 'review_request' && !settings.google_review_link && <ReviewLinkForm onSaved={() => show({ text: 'Review link saved for both phones' })} />}

        <div className="flex flex-col gap-2">
          <TextArea
            label="Draft"
            hint={draft !== null ? 'Edited' : 'Edit before sending'}
            value={text}
            onChange={setDraft}
            rows={10}
            error={bad ? `Review requests can’t mention “${bad}”. Google removes reviews that were rewarded. Please take it out.` : null}
          />
          <div className="flex items-center justify-between gap-2">
            {draft !== null ? (
              <button type="button" onClick={() => setDraft(null)} className="min-h-touch text-[14px] font-semibold text-peacock underline underline-offset-4">
                Undo my edits
              </button>
            ) : (
              <span />
            )}
            {picked && !picked.is_preset && (
              <button
                type="button"
                onClick={() =>
                  archive.mutate(picked.id, {
                    onSuccess: () => {
                      setPickedId(null);
                      setDraft(null);
                      show({ text: 'Template removed' });
                    },
                  })
                }
                className="min-h-touch text-[14px] font-semibold text-muted underline underline-offset-4"
              >
                Remove this template
              </button>
            )}
          </div>
          {kind === 'review_request' && (
            <p className="text-[14px] text-muted">Review requests never carry an offer, and go to every guest, not only happy ones.</p>
          )}
          <AnimatePresence>
            {missingLink && kind === 'review_request' && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[14px] text-terracotta">
                The draft still says {REVIEW_LINK_PLACEHOLDER}. Add your link above, or replace it in the draft.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-2.5">
          <a
            href={blocked ? undefined : whatsAppUrl(waNumber(guest.phone), text)}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={blocked}
            onClick={(e) => blocked && e.preventDefault()}
            className={cx(
              'inline-flex min-h-primary items-center justify-center gap-2.5 rounded-btn bg-peacock px-6 font-display text-[19px] font-semibold text-white',
              blocked && 'pointer-events-none opacity-45',
            )}
          >
            <Icon name="chat" size={22} />
            Open in WhatsApp
          </a>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              icon={<Icon name="copy" size={20} />}
              disabled={blocked}
              onClick={async () => show((await copyText(text)) ? { text: 'Copied' } : { text: 'Couldn’t copy', tone: 'error' })}
            >
              Copy text
            </Button>
            <a
              href={blocked ? undefined : mailtoUrl(guest.email, subject, text)}
              aria-disabled={blocked}
              onClick={(e) => blocked && e.preventDefault()}
              className={cx(
                'inline-flex min-h-touch items-center justify-center gap-2.5 rounded-2xl border border-line-strong bg-white px-5 font-display text-[16px] font-semibold text-teak',
                blocked && 'pointer-events-none opacity-45',
              )}
            >
              <Icon name="mail" size={20} />
              Email
            </a>
          </div>
          <p className="text-center text-[13px] text-muted">Nothing is sent from the app. WhatsApp opens with the text filled in; you press Send.</p>
        </div>
      </div>

      <TemplateSheet
        open={adding}
        kind={kind}
        language={language}
        onClose={() => setAdding(false)}
        onSaved={(title) => {
          show({ text: 'Template saved for both phones' });
          setPickedId(null);
          setNewTitle(title);
          setDraft(null);
        }}
      />
      <Toast toast={toast} onHide={hide} />
    </Screen>
  );
}

function ReviewLinkForm({ onSaved }: { onSaved: () => void }) {
  const save = useSetReviewLink();
  const online = useOnline();
  const [link, setLink] = useState('');
  const ok = /^https:\/\/\S+$/.test(link.trim());
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-haldi p-4">
      <p className="text-[15px]">
        <strong className="font-semibold">Add your Google review link</strong> once, and every review request fills it in. In Google Maps, open your listing and tap “Ask for
        reviews” to copy it.
      </p>
      <TextField
        label="Review link"
        type="url"
        inputMode="url"
        placeholder="https://g.page/r/…/review"
        value={link}
        onChange={setLink}
        autoComplete="off"
        error={link.trim() && !ok ? 'It should start with https://' : null}
      />
      {save.error && <p className="text-[14px] text-terracotta">{save.error.message}</p>}
      <Button disabled={!ok || !online || save.isPending} onClick={() => save.mutate(link.trim(), { onSuccess: onSaved })}>
        {save.isPending ? 'Saving…' : 'Save link'}
      </Button>
    </div>
  );
}
