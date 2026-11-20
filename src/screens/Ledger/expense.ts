/** Add expense: the form's checks and what gets saved. Whole rupees, never on a guest's bill. */
import type { NewExpense, PaymentMode } from '@/data/types';
import { isISODate, type ISODate } from '@/lib/dates';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/labels';

export interface ExpenseDraft {
  category: ExpenseCategory | null;
  amount: number | null;
  mode: PaymentMode;
  paidOn: ISODate;
  note: string;
  stayId: string;
}

export const newExpense = (today: ISODate, stayId = ''): ExpenseDraft => ({ category: null, amount: null, mode: 'cash', paidOn: today, note: '', stayId });

/** The first thing to fix, in screen order, or null when it can be saved. */
export function expenseError(d: ExpenseDraft, today: ISODate): string | null {
  if (!d.category || !EXPENSE_CATEGORIES.includes(d.category)) return 'Pick what it was for.';
  if (d.amount === null || d.amount <= 0) return 'Enter the amount.';
  if (!isISODate(d.paidOn) || d.paidOn > today) return 'Pick the day it was paid (today or earlier).';
  if (d.category === 'Other' && !d.note.trim()) return 'Add a note saying what it was for.';
  if (d.note.trim().length > 200) return 'Keep the note under 200 letters.';
  return null;
}

export function expensePayload(d: ExpenseDraft, createdBy: string): NewExpense {
  if (!d.category || d.amount === null) throw new Error('Incomplete expense');
  return {
    category: d.category,
    note: d.note.trim() || null,
    amount: d.amount,
    mode: d.mode,
    paid_on: d.paidOn,
    stay_id: d.stayId || null,
    created_by: createdBy,
  };
}
