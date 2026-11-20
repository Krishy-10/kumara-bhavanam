import { describe, expect, it } from 'vitest';
import { expenseError, expensePayload, newExpense, type ExpenseDraft } from './expense';

const today = '2026-11-21';
const good = (over: Partial<ExpenseDraft> = {}): ExpenseDraft => ({ ...newExpense(today), category: 'Water', amount: 400, ...over });

describe('expense form', () => {
  it('starts as cash, paid today, no stay', () => {
    expect(newExpense(today)).toEqual({ category: null, amount: null, mode: 'cash', paidOn: today, note: '', stayId: '' });
    expect(newExpense(today, 's1').stayId).toBe('s1');
  });

  it('asks for what is missing, in screen order', () => {
    expect(expenseError(good(), today)).toBeNull();
    expect(expenseError(good({ category: null }), today)).toMatch(/what it was for/);
    expect(expenseError(good({ amount: null }), today)).toMatch(/amount/);
    expect(expenseError(good({ amount: 0 }), today)).toMatch(/amount/);
    expect(expenseError(good({ paidOn: '2026-11-22' }), today)).toMatch(/day it was paid/);
    expect(expenseError(good({ category: 'Other' }), today)).toMatch(/note/);
    expect(expenseError(good({ category: 'Other', note: 'Pest control' }), today)).toBeNull();
    expect(expenseError(good({ note: 'x'.repeat(201) }), today)).toMatch(/200/);
  });

  it('saves trimmed text, whole rupees and an optional stay', () => {
    expect(expensePayload(good({ note: '  Cans  ', stayId: 's1', mode: 'upi' }), 'Padmanabhan')).toEqual({
      category: 'Water',
      note: 'Cans',
      amount: 400,
      mode: 'upi',
      paid_on: today,
      stay_id: 's1',
      created_by: 'Padmanabhan',
    });
    expect(expensePayload(good(), 'K')).toMatchObject({ note: null, stay_id: null });
  });
});
