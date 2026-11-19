/**
 * Phone numbers are the guest lookup key, stored as +<country><number>
 * (e.g. +919843112345) to match the guests.phone check in the database.
 */

/** Turns what someone typed into +<digits>, or null if it can't be a phone number. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/** Indian mobiles start with 6–9; anything else is worth a second look. */
export function looksLikeIndianMobile(e164: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(e164);
}

/** "+91 98431 12345" for display. */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/** Digits only, as wa.me expects (no + and no spaces). */
export function waNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}
