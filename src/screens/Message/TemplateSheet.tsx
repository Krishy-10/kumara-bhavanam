/** Add a message template, shared by both phones. Review requests are checked for incentives. */
import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { FieldLabel, TextField } from '@/components/Controls';
import { Sheet } from '@/components/Sheet';
import { useAddTemplate } from '@/data/hooks';
import type { Language, TemplateKind } from '@/data/types';
import { useOnline } from '@/hooks/useOnline';
import { incentiveWord, PLACEHOLDERS } from '@/lib/templates';
import { cx } from '@/lib/cx';
import { useCurrentUser } from '@/session/UserContext';

const KIND_LABEL: Record<TemplateKind, string> = { thank_you: 'thank-you', review_request: 'review request' };

export function TemplateSheet({
  open,
  kind,
  language,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: TemplateKind;
  language: Language;
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`New ${KIND_LABEL[kind]} (${language === 'ta' ? 'தமிழ்' : 'English'})`}>
      {open && <TemplateForm kind={kind} language={language} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function TemplateForm({ kind, language, onClose, onSaved }: { kind: TemplateKind; language: Language; onClose: () => void; onSaved: (title: string) => void }) {
  const user = useCurrentUser();
  const online = useOnline();
  const add = useAddTemplate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const bad = kind === 'review_request' ? incentiveWord(body) || incentiveWord(title) : null;
  const valid = title.trim() && body.trim() && !bad;

  const insert = (token: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? body.length;
    const next = body.slice(0, at) + token + body.slice(el?.selectionEnd ?? at);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <TextField label="Name" value={title} onChange={setTitle} placeholder="e.g. Festival thanks" autoComplete="off" />
      <div>
        <FieldLabel htmlFor="tpl-body" hint="Filled in for each guest">
          Message
        </FieldLabel>
        <textarea
          id="tpl-body"
          ref={area}
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={bad ? true : undefined}
          aria-describedby="tpl-help"
          placeholder={language === 'ta' ? 'வணக்கம் {guest} ஜி, …' : 'Vanakkam {guest} ji, …'}
          className={cx(
            'w-full rounded-2xl border border-line-strong bg-white px-4 py-3 text-[17px] leading-relaxed focus:border-peacock focus:shadow-[0_0_0_4px_rgba(15,94,90,0.12)] focus:outline-none',
            bad && 'border-terracotta',
          )}
        />
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Insert a placeholder">
          {PLACEHOLDERS.filter((p) => kind === 'review_request' || p !== '{review_link}').map((p) => (
            <button key={p} type="button" onClick={() => insert(p)} className="min-h-touch rounded-full border border-line-strong bg-white px-3 font-mono text-[14px]">
              {p}
            </button>
          ))}
        </div>
        <p id="tpl-help" className={cx('mt-2 text-[14px]', bad ? 'text-terracotta' : 'text-muted')}>
          {bad
            ? `A review request can’t mention “${bad}”. Google removes reviews that were rewarded.`
            : '{guest} becomes the first name, {occasion} the occasion, {nights} the number of nights.'}
        </p>
      </div>
      {add.error && (
        <p role="alert" className="rounded-2xl bg-terracotta-50 px-4 py-3 text-[15px] text-terracotta">
          {add.error.message}
        </p>
      )}
      <Button
        size="lg"
        block
        disabled={!valid || !online || add.isPending}
        onClick={() =>
          add.mutate(
            { kind, language, title: title.trim(), body: body.trim(), created_by: user },
            {
              onSuccess: () => {
                onSaved(title.trim());
                onClose();
              },
            },
          )
        }
      >
        {add.isPending ? 'Saving…' : 'Save template'}
      </Button>
    </div>
  );
}
