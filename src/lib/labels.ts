/** Words shown for stored codes, and the short pick-lists used in forms. */
import type { DocType, PaymentMode } from '@/data/types';
import type { PaymentType, StayStatus } from './money';

export const STATUS_LABEL: Record<StayStatus, string> = {
  enquiry: 'Enquiry',
  tentative: 'Tentative',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  other: 'Other',
};

export const OCCASIONS = ['Sashti', 'Pilgrimage', 'Temple visit', 'Wedding', 'Family function', 'Holiday', 'Other'] as const;
export const SOURCES = ['Phone', 'WhatsApp', 'Referral', 'Returning guest', 'Walk-in', 'Online', 'Other'] as const;
/** Must match the charges_discount_label check in the database. */
export const DISCOUNT_LABELS = ['Returning guest', 'Referral', 'Long stay', 'Other'] as const;
export const EXTRA_LABELS = ['Extra bedding', 'Extra mattress', 'Late check-out', 'Cleaning', 'Other'] as const;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  advance: 'Advance',
  payment: 'Payment',
  refund: 'Refund',
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  aadhaar: 'Aadhaar',
  passport: 'Passport',
  driving_licence: 'Driving licence',
  voter_id: 'Voter ID',
  other: 'Other ID',
};

export const BLOCK_REASONS = ['Maintenance', 'Family use', 'Cleaning', 'Other'] as const;
export const VOID_REASONS = ['Entered twice', 'Wrong amount', 'Wrong stay', 'Other'] as const;

/** Expense categories (DB-checked in migration 006). "Other" needs a note. */
export const EXPENSE_CATEGORIES = ['Electricity', 'Water', 'Cleaning', 'Laundry', 'Repairs', 'Supplies', 'Gas', 'Internet', 'Other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
