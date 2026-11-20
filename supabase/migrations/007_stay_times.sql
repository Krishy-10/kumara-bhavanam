-- =============================================================================
-- 007: expected check-in and check-out times on a stay (decided Nov 20 2026).
--
-- Run after 001-006, in the Supabase SQL editor. No new tables, so
-- demo_policies.sql does not need running again.
--
--   stays.check_in_time   time, optional: when the guest expects to arrive
--   stays.check_out_time  time, optional: when they expect to leave
--
-- Wall-clock times in IST (no time zone), typed in New booking or on the stay.
-- Information only: they never touch money, nights, overlaps or the bill.
-- stay_totals gains the two columns at the end; create_booking v4 accepts them.
-- =============================================================================
begin;

alter table public.stays
  add column check_in_time  time,
  add column check_out_time time;

comment on column public.stays.check_in_time  is 'Expected arrival time (IST wall clock). Optional, information only.';
comment on column public.stays.check_out_time is 'Expected leaving time (IST wall clock). Optional, information only.';

-- -----------------------------------------------------------------------------
-- stay_totals: exactly as 004, with check_in_time and check_out_time appended.
-- THE place money is worked out. Mirrors src/lib/money.ts.
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
         coalesce(k.commission_paid, 0)  as commission_paid,
         s.check_in_time,
         s.check_out_time
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
       (commission - commission_paid)        as commission_owed,
       check_in_time,
       check_out_time
from t;

comment on view public.stay_totals is
  'One row per stay: the stay, its guest, its referrer, its money, its referrer commission and its expected times. Screens read stays from here. Mirrors src/lib/money.ts computeStayTotals() and commissionTotals(). Never store these numbers.';

-- -----------------------------------------------------------------------------
-- create_booking, v4. Same as 004 except the stay may carry
--   "check_in_time": "HH:MM", "check_out_time": "HH:MM"   (optional; blank = none)
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
    pricing_mode, nightly_rate, fixed_amount, occasion, sources, referrer_id, notes,
    check_in_time, check_out_time, created_by
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
    nullif(trim(s ->> 'check_in_time'), '')::time,
    nullif(trim(s ->> 'check_out_time'), '')::time,
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
