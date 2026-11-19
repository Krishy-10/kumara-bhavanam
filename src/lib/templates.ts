/**
 * Message drafts: fill a template's placeholders for one stay. The owner
 * always reads and edits the draft; nothing is ever sent automatically.
 */
import { plural } from './labels';

export const REVIEW_LINK_PLACEHOLDER = '[YOUR GOOGLE REVIEW LINK]';

/**
 * Words a review request may never contain. Must match the
 * review_request_has_no_incentive check in supabase/migrations/001_init.sql.
 */
const INCENTIVE_RE = /(discount|offer|coupon|voucher|cashback|cash back|gift|reward|% ?off|free (stay|night|meal|breakfast))/i;

/** The incentive word found in a review request, or null if it is clean. */
export function incentiveWord(text: string): string | null {
  return INCENTIVE_RE.exec(text)?.[0] ?? null;
}

export interface TemplateValues {
  guestName: string;
  occasion: string | null;
  nights: number;
  reviewLink: string | null;
}

/**
 * {occasion} as a phrase that fits "for {occasion}" or "We hope {occasion} went well":
 * "the pilgrimage", "Sashti", "your holiday", or "your visit" when none is tagged.
 */
const OCCASION_PHRASE: Record<string, string> = {
  Sashti: 'Sashti',
  Pilgrimage: 'the pilgrimage',
  'Temple visit': 'the temple visit',
  Wedding: 'the wedding',
  'Family function': 'the family function',
  Holiday: 'your holiday',
};

export function occasionPhrase(occasion: string | null): string {
  return (occasion ? OCCASION_PHRASE[occasion] : undefined) ?? 'your visit';
}

/** "Lakshmi Narayanan" → "Lakshmi". */
export function guestFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * {guest} → first name, {occasion} → "the pilgrimage" style wording,
 * {nights} → number (and "{nights} nights" → "1 night" / "8 nights"),
 * {review_link} → the saved link or a clear placeholder.
 * Unknown placeholders are left as typed.
 */
export function fillTemplate(body: string, v: TemplateValues): string {
  return body
    .replace(/\{nights\}\s+nights/g, plural(v.nights, 'night'))
    .replace(/\{guest\}/g, guestFirstName(v.guestName))
    .replace(/\{occasion\}/g, occasionPhrase(v.occasion))
    .replace(/\{nights\}/g, String(v.nights))
    .replace(/\{review_link\}/g, v.reviewLink ?? REVIEW_LINK_PLACEHOLDER);
}

export const PLACEHOLDERS = ['{guest}', '{occasion}', '{nights}', '{review_link}'] as const;
