-- =============================================================================
-- Kumara Bhavanam · 004_commission_past_stays.sql   (decided with the owner, 21 Nov 2026)
--   * Referrer commission. Typed per booking (whole rupees), shown as owed to
--     the stay's referrer, then marked paid with a date and mode. Never on the
--     guest's bill. Same rule as payments: never edited or deleted, only voided
--     with a reason; a mistake is fixed by voiding and adding a new row.
--       commissions         one live (non-voided) commission per stay
--       commission_payouts  one live payout per commission, for the full amount
--   * stay_totals gets four columns AT THE END (existing columns unchanged):
--       commission_id, commission, commission_paid, commission_owed
--     commission_owed = commission − commission_paid. Mirrors src/lib/money.ts
--     commissionTotals(). Booked revenue, Final and Balance are NOT affected.
--   * create_booking v3: the up-front payment may be saved as type 'payment'
--     (the Ledger's "Add past stay" form), and a Completed booking must have
--     already ended (IST). Everything else is as in 003.
--
-- Run once, after 001–003, in the Supabase SQL editor. One transaction.
-- On the DEMO project, run supabase/demo_policies.sql again afterwards.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- commissions
-- -----------------------------------------------------------------------------
create table public.commissions (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stays (id) on delete restrict,
  amount       integer not null check (amount > 0),
  voided       boolean not null default false,
  void_reason  text,
  voided_at    timestamptz,
  voided_by    text,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  constraint commissions_void_has_reason check (
    not voided or (length(trim(coalesce(void_reason, ''))) > 0 and voided_by is not null)
  )
);

create unique index commissions_one_live_per_stay on public.commissions (stay_id) where not voided;

comment on table public.commissions is
  'Commission owed to the stay''s referrer. Append-only: void with a reason, never edit or delete. Never on the guest''s bill.';

-- -----------------------------------------------------------------------------
-- commission_payouts
-- -----------------------------------------------------------------------------
create table public.commission_payouts (
  id             uuid primary key default gen_random_uuid(),
  commission_id  uuid not null references public.commissions (id) on delete restrict,
  amount         integer not null check (amount > 0),
  mode           text not null default 'upi' check (mode in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
  paid_on        date not null,
  reference      text,
  voided         boolean not null default false,
  void_reason    text,
  voided_at      timestamptz,
  voided_by      text,
  created_at     timestamptz not null default now(),
  created_by     text not null check (length(trim(created_by)) > 0),

  constraint commission_payouts_void_has_reason check (
    not voided or (length(trim(coalesce(void_reason, ''))) > 0 and voided_by is not null)
  )
);

create unique index commission_payouts_one_live on public.commission_payouts (commission_id) where not voided;
create index commission_payouts_paid_on_idx on public.commission_payouts (paid_on);

comment on table public.commission_payouts is
  'Commission paid to a referrer. Counted by paid_on. Append-only: void with a reason.';

-- Never edited or deleted; only voided (same guard as payments and charges).
create trigger commissions_guard before update or delete on public.commissions
  for each row execute function public.guard_money_row();
create trigger commission_payouts_guard before update or delete on public.commission_payouts
  for each row execute function public.guard_money_row();

-- A commission needs a stay with a referrer.
create or replace function public.check_commission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.stays where id = new.stay_id and referrer_id is not null) then
    raise exception 'Commission needs a booking with a referrer.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger commissions_check before insert on public.commissions
  for each row execute function public.check_commission();

-- A payout pays a live commission in full.
create or replace function public.check_commission_payout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c record;
begin
  select amount, voided into c from public.commissions where id = new.commission_id;
  if not found or c.voided then
    raise exception 'That commission is voided; it can''t be paid.'
      using errcode = 'check_violation';
  end if;
  if new.amount <> c.amount then
    raise exception 'A payout must be the full commission (₹%).', c.amount
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger commission_payouts_check before insert on public.commission_payouts
  for each row execute function public.check_commission_payout();

-- A paid commission can't be voided until its payout is voided.
create or replace function public.check_commission_void()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.voided and not old.voided
     and exists (select 1 from public.commission_payouts where commission_id = old.id and not voided) then
    raise exception 'This commission is marked paid. Void the payment to the referrer first.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Runs after commissions_guard (triggers fire in name order).
create trigger commissions_void_check before update on public.commissions
  for each row execute function public.check_commission_void();

-- -----------------------------------------------------------------------------
-- stay_totals: unchanged up to balance; four commission columns appended.
-- THE place money is worked out. Mirrors src/lib/money.ts.
--   commission       = the live commission's amount (0 if none)
--   commission_paid  = its live payout (0 if none)
--   commission_owed  = commission − commission_paid
-- -----------------------------------------------------------------------------
create or replace view public.stay_totals
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
k as (
  select cm.stay_id,
         cm.id                                  as commission_id,
         cm.amount                              as commission,
         coalesce(sum(cp.amount), 0)::integer   as commission_paid
  from public.commissions cm
  left join public.commission_payouts cp on cp.commission_id = cm.id and not cp.voided
  where not cm.voided
  group by cm.stay_id, cm.id, cm.amount
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
         s.status,
         s.pricing_mode,
         s.nightly_rate,
         s.fixed_amount,
         s.occasion,
         s.sources,
         s.referrer_id,
         r.name as referrer_name,
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
         coalesce(p.refunded, 0)  as refunded,
         k.commission_id,
         coalesce(k.commission, 0)       as commission,
         coalesce(k.commission_paid, 0)  as commission_paid
  from public.stays s
  join public.guests g on g.id = s.guest_id
  left join public.referrers r on r.id = s.referrer_id
  left join c on c.stay_id = s.id
  left join p on p.stay_id = s.id
  left join k on k.stay_id = s.id
)
select stay_id,
       guest_id,
       guest_name,
       guest_phone,
       bill_no,
       check_in,
       check_out,
       guests_count,
       status,
       pricing_mode,
       nightly_rate,
       fixed_amount,
       occasion,
       sources,
       referrer_id,
       referrer_name,
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
       end                                   as balance,
       commission_id,
       commission,
       commission_paid,
       (commission - commission_paid)        as commission_owed
from t;

comment on view public.stay_totals is
  'One row per stay: the stay, its guest, its referrer, its money and its referrer commission. Screens read stays from here. Mirrors src/lib/money.ts computeStayTotals() and commissionTotals(). Never store these numbers.';

-- -----------------------------------------------------------------------------
-- Access: grants and LIVE policies. Demo anon policies: supabase/demo_policies.sql.
-- -----------------------------------------------------------------------------
alter table public.commissions enable row level security;
alter table public.commission_payouts enable row level security;

grant select, insert, update on public.commissions, public.commission_payouts to anon, authenticated;
revoke delete, truncate on public.commissions, public.commission_payouts from anon, authenticated;
grant select on public.stay_totals to anon, authenticated;

create policy live_commissions_select on public.commissions for select to authenticated using (public.is_allowed_user());
create policy live_commissions_insert on public.commissions for insert to authenticated with check (public.is_allowed_user());
create policy live_commissions_void   on public.commissions for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_commission_payouts_select on public.commission_payouts for select to authenticated using (public.is_allowed_user());
create policy live_commission_payouts_insert on public.commission_payouts for insert to authenticated with check (public.is_allowed_user());
create policy live_commission_payouts_void   on public.commission_payouts for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

-- -----------------------------------------------------------------------------
-- create_booking, v3. Same as 003 except:
--   "advance": { ..., "type": "advance" | "payment" }   (default "advance";
--               "payment" is used for a past stay paid at the time)
--   A "completed" booking must have checked out by today (IST).
-- -----------------------------------------------------------------------------
create or replace function public.create_booking(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  by_name  text := nullif(trim(p ->> 'created_by'), '');
  g        jsonb := p -> 'guest';
  s        jsonb := p -> 'stay';
  adv      jsonb := p -> 'advance';
  ref      jsonb := p -> 'referrer';
  adv_type text := coalesce(nullif(p -> 'advance' ->> 'type', ''), 'advance');
  today    date := (now() at time zone 'Asia/Kolkata')::date;
  srcs     text[];
  ch       jsonb;
  g_id     uuid;
  r_id     uuid;
  s_id     uuid;
  bill     text;
begin
  if by_name is null then
    raise exception 'created_by is required' using errcode = 'not_null_violation';
  end if;

  if adv_type not in ('advance', 'payment') then
    raise exception 'The first payment must be an advance or a payment.' using errcode = 'check_violation';
  end if;

  if coalesce(s ->> 'status', 'confirmed') = 'completed' and (s ->> 'check_out')::date > today then
    raise exception 'A past stay must have checked out by today.' using errcode = 'check_violation';
  end if;

  -- Sources: trimmed, blanks dropped, duplicates removed, first-seen order kept.
  -- The old single "source" (an older app version) still works.
  if jsonb_typeof(s -> 'sources') = 'array' then
    select coalesce(array_agg(v order by o), '{}') into srcs
    from (
      select trim(e) as v, min(o) as o
      from jsonb_array_elements_text(s -> 'sources') with ordinality as t(e, o)
      where trim(e) <> ''
      group by trim(e)
    ) q;
  elsif nullif(trim(s ->> 'source'), '') is not null then
    srcs := array[trim(s ->> 'source')];
  else
    srcs := '{}';
  end if;

  -- Guest: the phone number is the key.
  select id into g_id from public.guests where phone = g ->> 'phone';
  if g_id is null then
    insert into public.guests (name, phone, email, city, language, nationality, created_by)
    values (
      g ->> 'name',
      g ->> 'phone',
      nullif(trim(g ->> 'email'), ''),
      nullif(trim(g ->> 'city'), ''),
      coalesce(g ->> 'language', 'en'),
      coalesce(nullif(trim(g ->> 'nationality'), ''), 'Indian'),
      by_name
    )
    returning id into g_id;
  else
    update public.guests
       set name        = coalesce(nullif(trim(g ->> 'name'), ''), name),
           email       = coalesce(nullif(trim(g ->> 'email'), ''), email),
           city        = coalesce(nullif(trim(g ->> 'city'), ''), city),
           language    = coalesce(g ->> 'language', language),
           nationality = coalesce(nullif(trim(g ->> 'nationality'), ''), nationality),
           archived_at = null
     where id = g_id;
  end if;

  -- Referrer: only for a Referral booking (unchanged from 003).
  if 'Referral' = any (srcs) and jsonb_typeof(ref) = 'object' then
    if nullif(ref ->> 'id', '') is not null then
      r_id := (ref ->> 'id')::uuid;
    elsif nullif(trim(ref ->> 'name'), '') is not null then
      if nullif(trim(ref ->> 'phone'), '') is not null then
        select id into r_id from public.referrers where phone = trim(ref ->> 'phone');
      elsif (select count(*) from public.referrers
              where lower(name) = lower(trim(ref ->> 'name')) and archived_at is null) = 1 then
        select id into r_id from public.referrers
         where lower(name) = lower(trim(ref ->> 'name')) and archived_at is null;
      end if;
      if r_id is null then
        insert into public.referrers (name, phone, created_by)
        values (trim(ref ->> 'name'), nullif(trim(ref ->> 'phone'), ''), by_name)
        returning id into r_id;
      end if;
    end if;
  end if;

  insert into public.stays (
    guest_id, check_in, check_out, guests_count, status,
    pricing_mode, nightly_rate, fixed_amount, occasion, sources, referrer_id, notes, created_by
  ) values (
    g_id,
    (s ->> 'check_in')::date,
    (s ->> 'check_out')::date,
    coalesce((s ->> 'guests_count')::integer, 2),
    coalesce(s ->> 'status', 'confirmed'),
    s ->> 'pricing_mode',
    (s ->> 'nightly_rate')::integer,
    (s ->> 'fixed_amount')::integer,
    nullif(trim(s ->> 'occasion'), ''),
    srcs,
    r_id,
    nullif(trim(s ->> 'notes'), ''),
    by_name
  )
  returning id, bill_no into s_id, bill;

  for ch in select value from jsonb_array_elements(coalesce(p -> 'charges', '[]'::jsonb))
  loop
    insert into public.charges (stay_id, kind, label, amount, created_by)
    values (s_id, ch ->> 'kind', ch ->> 'label', (ch ->> 'amount')::integer, by_name);
  end loop;

  if adv is not null and jsonb_typeof(adv) = 'object' and coalesce((adv ->> 'amount')::integer, 0) > 0 then
    insert into public.payments (stay_id, amount, type, mode, paid_on, reference, created_by)
    values (
      s_id,
      (adv ->> 'amount')::integer,
      adv_type,
      coalesce(adv ->> 'mode', 'upi'),
      (adv ->> 'paid_on')::date,
      nullif(trim(adv ->> 'reference'), ''),
      by_name
    );
  end if;

  return jsonb_build_object('stay_id', s_id, 'bill_no', bill, 'guest_id', g_id, 'referrer_id', r_id);
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to anon, authenticated;

commit;
