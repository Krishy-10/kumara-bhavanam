-- =============================================================================
-- Kumara Bhavanam · 006_expenses.sql   (decided with the owner, 21 Nov 2026)
--   * Expenses: money spent on the house (electricity, water, cleaning…).
--     Whole rupees. NEVER on a guest's bill.
--   * Same rule as payments: never edited or deleted, only voided with a
--     reason; a mistake is fixed by voiding and adding a new row.
--   * Counted by paid_on (the day the money went out), like Collected.
--   * Optionally linked to one stay (e.g. extra cleaning after a big group).
--   * Not stored anywhere as totals. Spent and "Left after costs"
--     (collected − expenses − commission paid, all by date paid) are worked
--     out in src/lib/money.ts (expensesBetween, leftAfterCosts).
--
-- Run once, after 001–005, in the Supabase SQL editor. One transaction.
-- On the DEMO project, run supabase/demo_policies.sql again afterwards.
-- =============================================================================

begin;

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in (
                 'Electricity', 'Water', 'Cleaning', 'Laundry', 'Repairs',
                 'Supplies', 'Gas', 'Internet', 'Other')),
  note         text check (note is null or length(note) <= 200),
  amount       integer not null check (amount > 0),
  mode         text not null default 'upi' check (mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  paid_on      date not null,
  stay_id      uuid references public.stays (id) on delete restrict,
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  voided_by    text,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  constraint expenses_other_has_note check (category <> 'Other' or length(trim(coalesce(note, ''))) > 0),
  constraint expenses_void_has_reason check (
    not voided or (length(trim(coalesce(void_reason, ''))) > 0 and voided_by is not null)
  )
);

create index expenses_paid_on_idx on public.expenses (paid_on);
create index expenses_stay_idx on public.expenses (stay_id) where stay_id is not null;

comment on table public.expenses is
  'Money spent on the house, counted by paid_on. Never on a guest''s bill. Append-only: void with a reason, never edit or delete.';

-- Never edited or deleted; only voided (same guard as payments, charges, commissions).
create trigger expenses_guard before update or delete on public.expenses
  for each row execute function public.guard_money_row();

-- -----------------------------------------------------------------------------
-- Access: grants and LIVE policies. Demo anon policies: supabase/demo_policies.sql.
-- -----------------------------------------------------------------------------
alter table public.expenses enable row level security;

grant select, insert, update on public.expenses to anon, authenticated;
revoke delete, truncate on public.expenses from anon, authenticated;

create policy live_expenses_select on public.expenses for select to authenticated using (public.is_allowed_user());
create policy live_expenses_insert on public.expenses for insert to authenticated with check (public.is_allowed_user());
create policy live_expenses_void   on public.expenses for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

commit;
