/**
 * Formatting and parsing of rupee amounts. Money is always an integer number
 * of rupees; these helpers never produce or accept fractions.
 */
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,00,000 style. Negative amounts get a proper minus sign: −₹500. */
export function formatRupees(amount: number): string {
  assertRupees(amount);
  const sign = amount < 0 ? '−' : '';
  return `${sign}₹${inr.format(Math.abs(amount))}`;
}

/** "+ ₹500" / "− ₹500" for bill lines. */
export function formatSigned(amount: number, sign: '+' | '−'): string {
  return `${sign} ${formatRupees(Math.abs(amount))}`;
}

/**
 * Parses what someone typed ("5,000", "₹ 5000", " 5000 ") into whole rupees.
 * Returns null for anything that is not a whole, non-negative number.
 */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function assertRupees(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Money must be whole rupees, got ${amount}`);
  }
}

const inrCompact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

/** "₹40K", "₹1.2L", "₹1.5Cr" for chart axes. Exact figures stay in labels and tables. */
export function formatRupeesCompact(amount: number): string {
  assertRupees(amount);
  const sign = amount < 0 ? '−' : '';
  return `${sign}₹${inrCompact.format(Math.abs(amount))}`;
}
