-- =============================================================================
-- Kumara Bhavanam · 001_init.sql
-- Schema for V1: guests, stays, payments, charges, id_checks, blocked_dates,
-- allowed_users, message_templates, app_settings; the stay_totals and
-- stay_night_revenue views; the overlap constraint; bill numbers; RLS.
--
-- Rules this file enforces (see CLAUDE.md):
--   * Money is integer rupees. Totals and balances are never stored; they are
--     computed in stay_totals, mirrored by src/lib/money.ts.
--   * Stay dates are half-open [check_in, check_out).
--   * Confirmed / checked-in stays can never overlap (exclusion constraint).
--   * Payments are never updated or deleted, except to void them.
--   * No full ID numbers or ID images: id_checks holds type + last 4 only.
--   * Every row records created_by (the name picked on the phone).
--
-- This file contains NO anon-access policies. For the demo project only, run
-- supabase/demo_policies.sql afterwards. Never run that file on the live project.
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to read
-- top to bottom; it is one transaction.
-- =============================================================================

begin;

-- btree_gist lets the exclusion constraint mix range and equality operators.
-- Today it only uses daterange &&, but keeping btree_gist means a future
-- property_id = column can be added to the constraint without a new extension.
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Keeps updated_at current on tables that allow edits.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- allowed_users: who may sign in to the LIVE project (Google sign-in, later).
-- -----------------------------------------------------------------------------
create table public.allowed_users (
  email         text primary key check (email = lower(email) and email like '%@%'),
  display_name  text not null check (length(trim(display_name)) > 0),
  created_at    timestamptz not null default now()
);

comment on table public.allowed_users is
  'Live mode only: emails allowed to sign in. display_name is the picker name.';

-- True when the signed-in user's email is allow-listed. Used by live RLS.
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users au
    where au.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

-- -----------------------------------------------------------------------------
-- guests
-- -----------------------------------------------------------------------------
create table public.guests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  -- Stored normalised as +<country><number>, e.g. +919843100000. The lookup key.
  phone        text not null unique check (phone ~ '^\+[0-9]{8,15}$'),
  email        text check (email is null or email like '%@%'),
  city         text,
  language     text not null default 'en' check (language in ('en', 'ta')),
  nationality  text not null default 'Indian',
  notes        text,
  -- A guest with stays is never deleted (FK below is RESTRICT); archive instead.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),
  updated_at   timestamptz not null default now()
);

create index guests_name_idx on public.guests (lower(name));

create trigger guests_touch before update on public.guests
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Bill numbers: KB-<year>-<0001>, allocated by the database when a stay is
-- inserted. One counter row per year, so the number restarts each January.
-- The counter row is locked by the upsert, so two phones saving at the same
-- moment can never get the same number. A rolled-back insert also rolls back
-- the counter, so numbers have no gaps.
-- -----------------------------------------------------------------------------
create table public.bill_counters (
  year     integer primary key check (year between 2020 and 2100),
  last_no  integer not null check (last_no >= 0)
);

comment on table public.bill_counters is
  'Per-year bill counter. Written only by the assign_bill_no trigger.';

create or replace function public.assign_bill_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  y integer := extract(year from (now() at time zone 'Asia/Kolkata'))::integer;
  n integer;
begin
  if tg_op = 'UPDATE' then
    if new.bill_no is distinct from old.bill_no then
      raise exception 'Bill numbers never change (stay %).', old.id
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.bill_no is not null then
    -- Explicit numbers are only for seed data run in the SQL editor. Requests
    -- from the app (anon / authenticated via the API) may never choose one.
    if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') then
      raise exception 'Bill numbers are issued by the database.'
        using errcode = 'insufficient_privilege';
    end if;
    -- Keep the counter ahead of explicit seed numbers.
    if new.bill_no ~ '^KB-[0-9]{4}-[0-9]{4,}$' then
      insert into public.bill_counters as bc (year, last_no)
      values (split_part(new.bill_no, '-', 2)::integer, split_part(new.bill_no, '-', 3)::integer)
      on conflict (year) do update
        set last_no = greatest(bc.last_no, excluded.last_no);
    end if;
    return new;
  end if;

  insert into public.bill_counters as bc (year, last_no)
  values (y, 1)
  on conflict (year) do update set last_no = bc.last_no + 1
  returning last_no into n;

  new.bill_no := format('KB-%s-%s', y, lpad(n::text, 4, '0'));
  return new;
end;
$$;

revoke all on function public.assign_bill_no() from public;

-- -----------------------------------------------------------------------------
-- stays
-- -----------------------------------------------------------------------------
create table public.stays (
  id            uuid primary key default gen_random_uuid(),
  guest_id      uuid not null references public.guests (id) on delete restrict,
  bill_no       text not null unique,
  check_in      date not null,
  check_out     date not null,               -- excluded: the morning they leave
  guests_count  integer not null default 2 check (guests_count between 1 and 20),
  driver_room   boolean not null default false,
  status        text not null default 'confirmed'
                check (status in ('enquiry', 'tentative', 'confirmed', 'checked_in', 'completed', 'cancelled')),
  pricing_mode  text not null check (pricing_mode in ('per_night', 'fixed')),
  nightly_rate  integer check (nightly_rate is null or nightly_rate >= 0),
  fixed_amount  integer check (fixed_amount is null or fixed_amount >= 0),
  occasion      text,
  source        text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    text not null check (length(trim(created_by)) > 0),
  updated_at    timestamptz not null default now(),

  constraint stays_dates_valid check (check_out > check_in),
  constraint stays_price_matches_mode check (
    (pricing_mode = 'per_night' and nightly_rate is not null)
    or (pricing_mode = 'fixed' and fixed_amount is not null)
  ),
  -- The floor is one unit: two confirmed / checked-in stays may never share a
  -- night. Half-open ranges, so a check-out day is free for the next check-in.
  constraint stays_no_double_booking exclude using gist (
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('confirmed', 'checked_in'))
);

create index stays_guest_idx on public.stays (guest_id);
create index stays_dates_idx on public.stays (check_in, check_out);

-- bill_no is filled by the trigger; the NOT NULL check runs after BEFORE triggers.
create trigger stays_bill_no before insert or update of bill_no on public.stays
  for each row execute function public.assign_bill_no();

create trigger stays_touch before update on public.stays
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- charges: extras (+) and discounts (−), one line each. Like payments, a
-- mistake is voided, never edited or deleted, so the bill history is honest.
-- -----------------------------------------------------------------------------
create table public.charges (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stays (id) on delete restrict,
  kind         text not null check (kind in ('charge', 'discount')),
  label        text not null check (length(trim(label)) > 0),
  amount       integer not null check (amount > 0),   -- kind gives the sign
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  voided_by    text,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  constraint charges_discount_label check (
    kind <> 'discount' or label in ('Returning guest', 'Referral', 'Long stay', 'Other')
  ),
  constraint charges_void_has_reason check (
    not voided or (length(trim(coalesce(void_reason, ''))) > 0 and voided_by is not null)
  )
);

create index charges_stay_idx on public.charges (stay_id);

-- -----------------------------------------------------------------------------
-- payments: append-only. The one allowed update sets voided = true.
-- -----------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stays (id) on delete restrict,
  amount       integer not null check (amount > 0),   -- type gives the sign
  type         text not null check (type in ('advance', 'payment', 'refund')),
  mode         text not null default 'upi' check (mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  paid_on      date not null,
  reference    text,
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  voided_by    text,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  constraint payments_void_has_reason check (
    not voided or (length(trim(coalesce(void_reason, ''))) > 0 and voided_by is not null)
  )
);

create index payments_stay_idx on public.payments (stay_id);
create index payments_paid_on_idx on public.payments (paid_on);

-- Money rows (payments, charges) are never deleted, and the only update
-- allowed is voiding: voided false → true with a reason. Everything else,
-- including un-voiding, is refused by the database itself.
create or replace function public.guard_money_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% rows are never deleted. Void it instead.', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  if old.voided then
    raise exception 'This % row is already voided and cannot change.', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  if not new.voided then
    raise exception '% rows cannot be edited. Void it and add a new one.', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  -- Compare everything except the void columns.
  if (to_jsonb(new) - array['voided', 'void_reason', 'voided_at', 'voided_by'])
     is distinct from
     (to_jsonb(old) - array['voided', 'void_reason', 'voided_at', 'voided_by']) then
    raise exception 'Only the void fields of a % row can change.', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  new.voided_at := now();
  return new;
end;
$$;

create trigger payments_guard before update or delete on public.payments
  for each row execute function public.guard_money_row();

create trigger charges_guard before update or delete on public.charges
  for each row execute function public.guard_money_row();

-- -----------------------------------------------------------------------------
-- id_checks: a record that an ID was SEEN. Never the ID itself.
-- No full Aadhaar number, no image, no PDF, no QR data: last 4 characters only.
-- The app says "ID checked", never "Verified".
-- -----------------------------------------------------------------------------
create table public.id_checks (
  id          uuid primary key default gen_random_uuid(),
  stay_id     uuid not null unique references public.stays (id) on delete restrict,
  doc_type    text not null check (doc_type in ('aadhaar', 'passport', 'driving_licence', 'voter_id', 'other')),
  last4       text check (last4 is null or last4 ~ '^[A-Za-z0-9]{4}$'),
  checked_by  text not null check (length(trim(checked_by)) > 0),
  checked_at  timestamptz not null default now(),
  created_by  text not null check (length(trim(created_by)) > 0)
);

comment on column public.id_checks.last4 is
  'Last 4 characters only. Never store a full Aadhaar or any ID number.';

-- -----------------------------------------------------------------------------
-- blocked_dates: maintenance or family use. Both dates INCLUDED
-- (28 to 29 Nov blocks the nights of the 28th and the 29th).
-- They warn in New booking; they do not hard-block in the database.
-- -----------------------------------------------------------------------------
create table public.blocked_dates (
  id          uuid primary key default gen_random_uuid(),
  start_date  date not null,
  end_date    date not null,
  reason      text not null check (length(trim(reason)) > 0),
  created_at  timestamptz not null default now(),
  created_by  text not null check (length(trim(created_by)) > 0),
  constraint blocked_dates_valid check (end_date >= start_date)
);

-- -----------------------------------------------------------------------------
-- message_templates: thank-you and review-request drafts, preset or user-made.
-- Placeholders: {guest} {occasion} {nights} {review_link}
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('thank_you', 'review_request')),
  language     text not null default 'en' check (language in ('en', 'ta')),
  title        text not null check (length(trim(title)) > 0),
  body         text not null check (length(trim(body)) > 0),
  is_preset    boolean not null default false,
  sort_order   integer not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  -- Google removes reviews that were paid for with an incentive. A review
  -- request may never carry a discount, offer, gift or similar.
  constraint review_request_has_no_incentive check (
    kind <> 'review_request'
    or body !~* '(discount|offer|coupon|voucher|cashback|cash back|gift|reward|% ?off|free (stay|night|meal|breakfast))'
  )
);

-- -----------------------------------------------------------------------------
-- app_settings: one row of property details used on bills and messages.
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id                  boolean primary key default true check (id),
  property_name       text not null default 'Kumara Bhavanam',
  contact_phone       text,
  address             text,
  google_review_link  text check (google_review_link is null or google_review_link ~ '^https://'),
  updated_at          timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- stay_totals: THE place money is worked out. Mirrors src/lib/money.ts.
--   base     = nightly_rate × nights  |  fixed_amount
--   final    = base + Σ charges − Σ discounts            (voided ignored)
--   balance  = final − Σ payments + Σ refunds            (voided ignored)
--   balance  = 0 for a cancelled stay
-- security_invoker: the view runs with the caller's rights, so RLS applies.
-- -----------------------------------------------------------------------------
create view public.stay_totals
with (security_invoker = true)
as
with c as (
  select stay_id,
         coalesce(sum(amount) filter (where kind = 'charge'), 0)::integer   as charges,
         coalesce(sum(amount) filter (where kind = 'discount'), 0)::integer as discounts
  from public.charges
  where not voided
  group by stay_id
),
p as (
  select stay_id,
         coalesce(sum(amount) filter (where type in ('advance', 'payment')), 0)::integer as paid,
         coalesce(sum(amount) filter (where type = 'refund'), 0)::integer                as refunded
  from public.payments
  where not voided
  group by stay_id
),
t as (
  select s.id as stay_id,
         s.guest_id,
         g.name  as guest_name,
         g.phone as guest_phone,
         s.bill_no,
         s.check_in,
         s.check_out,
         s.guests_count,
         s.driver_room,
         s.status,
         s.pricing_mode,
         s.nightly_rate,
         s.fixed_amount,
         s.occasion,
         s.source,
         s.notes,
         s.created_at,
         s.created_by,
         (s.check_out - s.check_in)::integer as nights,
         case s.pricing_mode
           when 'per_night' then s.nightly_rate * (s.check_out - s.check_in)
           else s.fixed_amount
         end::integer as base,
         coalesce(c.charges, 0)   as charges,
         coalesce(c.discounts, 0) as discounts,
         coalesce(p.paid, 0)      as paid,
         coalesce(p.refunded, 0)  as refunded
  from public.stays s
  join public.guests g on g.id = s.guest_id
  left join c on c.stay_id = s.id
  left join p on p.stay_id = s.id
)
select stay_id,
       guest_id,
       guest_name,
       guest_phone,
       bill_no,
       check_in,
       check_out,
       guests_count,
       driver_room,
       status,
       pricing_mode,
       nightly_rate,
       fixed_amount,
       occasion,
       source,
       notes,
       created_at,
       created_by,
       nights,
       base,
       charges,
       discounts,
       (base + charges - discounts)          as final,
       paid,
       refunded,
       (paid - refunded)                     as net_paid,
       case when status = 'cancelled' then 0
            else base + charges - discounts - paid + refunded
       end                                   as balance
from t;

comment on view public.stay_totals is
  'One row per stay: the stay, its guest, and its money. Screens read stays from here. Mirrors src/lib/money.ts computeStayTotals(). Never store these numbers.';

-- -----------------------------------------------------------------------------
-- stay_night_revenue: booked revenue split by night, for analytics.
-- Only confirmed, checked-in and completed stays count. Each night gets
-- final / nights (integer division, truncates); the leftover rupees go on the
-- last night. Mirrors splitAcrossNights() in src/lib/money.ts.
-- -----------------------------------------------------------------------------
create view public.stay_night_revenue
with (security_invoker = true)
as
select s.id as stay_id,
       n.night::date as night,
       (st.final / st.nights
         + case when n.night::date = s.check_out - 1 then st.final % st.nights else 0 end
       )::integer as amount
from public.stays s
join public.stay_totals st on st.stay_id = s.id
cross join lateral generate_series(s.check_in, s.check_out - 1, interval '1 day') as n(night)
where s.status in ('confirmed', 'checked_in', 'completed')
  and st.nights > 0;

comment on view public.stay_night_revenue is
  'Analytics: booked revenue per night. Mirrors src/lib/money.ts splitAcrossNights().';

-- -----------------------------------------------------------------------------
-- Row-level security. Every table is locked down; access comes only from
-- policies. LIVE policies: a signed-in user whose email is in allowed_users.
-- (Demo anon policies live in supabase/demo_policies.sql, NOT here.)
-- -----------------------------------------------------------------------------
alter table public.allowed_users      enable row level security;
alter table public.guests             enable row level security;
alter table public.stays              enable row level security;
alter table public.charges            enable row level security;
alter table public.payments           enable row level security;
alter table public.id_checks          enable row level security;
alter table public.blocked_dates      enable row level security;
alter table public.message_templates  enable row level security;
alter table public.app_settings       enable row level security;
alter table public.bill_counters      enable row level security;  -- no policies: trigger only

-- Supabase usually grants these by default. They are stated here so the app
-- still works where automatic grants are turned off. Grants say what a role
-- may try; RLS policies still decide which rows (none, without a policy).
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.guests, public.stays, public.charges, public.payments,
  public.id_checks, public.blocked_dates, public.message_templates, public.app_settings
  to anon, authenticated;
grant delete on public.id_checks, public.blocked_dates to anon, authenticated;
grant select on public.stay_totals, public.stay_night_revenue to anon, authenticated;
grant select on public.allowed_users to authenticated;

-- Belt and braces on top of the guard triggers: no client role may delete
-- money rows or rewrite the bill counter.
revoke delete on public.payments, public.charges from anon, authenticated;
revoke truncate on all tables in schema public from anon, authenticated;
revoke all on public.bill_counters from anon, authenticated;

-- allowed_users: a signed-in allowed user may read the list (for the picker).
create policy live_allowed_users_read on public.allowed_users
  for select to authenticated using (public.is_allowed_user());

-- Standard live access for each app table.
create policy live_guests_select on public.guests for select to authenticated using (public.is_allowed_user());
create policy live_guests_insert on public.guests for insert to authenticated with check (public.is_allowed_user());
create policy live_guests_update on public.guests for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_stays_select on public.stays for select to authenticated using (public.is_allowed_user());
create policy live_stays_insert on public.stays for insert to authenticated with check (public.is_allowed_user());
create policy live_stays_update on public.stays for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_charges_select on public.charges for select to authenticated using (public.is_allowed_user());
create policy live_charges_insert on public.charges for insert to authenticated with check (public.is_allowed_user());
create policy live_charges_void   on public.charges for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_payments_select on public.payments for select to authenticated using (public.is_allowed_user());
create policy live_payments_insert on public.payments for insert to authenticated with check (public.is_allowed_user());
create policy live_payments_void   on public.payments for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_id_checks_select on public.id_checks for select to authenticated using (public.is_allowed_user());
create policy live_id_checks_insert on public.id_checks for insert to authenticated with check (public.is_allowed_user());
create policy live_id_checks_update on public.id_checks for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());
create policy live_id_checks_delete on public.id_checks for delete to authenticated using (public.is_allowed_user());

create policy live_blocked_select on public.blocked_dates for select to authenticated using (public.is_allowed_user());
create policy live_blocked_insert on public.blocked_dates for insert to authenticated with check (public.is_allowed_user());
create policy live_blocked_update on public.blocked_dates for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());
create policy live_blocked_delete on public.blocked_dates for delete to authenticated using (public.is_allowed_user());

create policy live_templates_select on public.message_templates for select to authenticated using (public.is_allowed_user());
create policy live_templates_insert on public.message_templates for insert to authenticated with check (public.is_allowed_user());
create policy live_templates_update on public.message_templates for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_settings_select on public.app_settings for select to authenticated using (public.is_allowed_user());
create policy live_settings_update on public.app_settings for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

commit;
