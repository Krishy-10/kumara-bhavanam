-- =============================================================================
-- Kumara Bhavanam · 003_sources_referrers.sql   (decided with the owner, 20 Nov 2026)
--   * "How they found us" can hold several answers: stays.source (one text)
--     becomes stays.sources (text[]). Existing values are carried over.
--   * Referrers: a shared list of people who send guests (name, optional
--     phone). A stay that came by Referral can point at one. The commission
--     ledger will build on this later.
--   * The driver room is removed (column dropped).
--   * stay_totals and stay_night_revenue are rebuilt with the new columns;
--     the money maths in them is unchanged (still mirrors src/lib/money.ts).
--   * create_booking accepts "sources" and "referrer"; it still accepts the
--     old single "source", so a phone on the previous app version keeps working.
--
-- Run once, after 001 and 002, in the Supabase SQL editor. One transaction.
-- On the DEMO project, run supabase/demo_policies.sql again afterwards (it is
-- safe to re-run) so the demo can read and add referrers.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- referrers
-- -----------------------------------------------------------------------------
create table public.referrers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 80),
  -- Optional, normalised like guests.phone (+<country><number>). For paying commission.
  phone        text unique check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  notes        text,
  -- Referrers with stays are never deleted (FK below is RESTRICT); archive instead.
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),
  updated_at   timestamptz not null default now()
);

create index referrers_name_idx on public.referrers (lower(name));

create trigger referrers_touch before update on public.referrers
  for each row execute function public.touch_updated_at();

comment on table public.referrers is
  'People who send guests (past guests, priests, agents, drivers). Picked on a booking that came by Referral.';

-- -----------------------------------------------------------------------------
-- stays: sources (several), referrer, no driver room
-- -----------------------------------------------------------------------------
-- The views read the columns being changed, so they are dropped and rebuilt.
drop view public.stay_night_revenue;
drop view public.stay_totals;

alter table public.stays
  add column sources text[] not null default '{}'
    constraint stays_sources_no_blanks check (array_position(sources, null) is null and array_position(sources, '') is null),
  add column referrer_id uuid references public.referrers (id) on delete restrict;

update public.stays set sources = array[trim(source)] where nullif(trim(source), '') is not null;

alter table public.stays
  drop column source,
  drop column driver_room,
  add constraint stays_referrer_needs_referral check (referrer_id is null or 'Referral' = any (sources));

create index stays_referrer_idx on public.stays (referrer_id) where referrer_id is not null;

-- -----------------------------------------------------------------------------
-- stay_totals: as in 001, with sources and the referrer instead of source and
-- driver_room. THE place money is worked out. Mirrors src/lib/money.ts.
--   base     = nightly_rate × nights  |  fixed_amount
--   final    = base + Σ charges − Σ discounts            (voided ignored)
--   balance  = final − Σ payments + Σ refunds            (voided ignored)
--   balance  = 0 for a cancelled stay
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
         coalesce(p.refunded, 0)  as refunded
  from public.stays s
  join public.guests g on g.id = s.guest_id
  left join public.referrers r on r.id = s.referrer_id
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
       end                                   as balance
from t;

comment on view public.stay_totals is
  'One row per stay: the stay, its guest, its referrer and its money. Screens read stays from here. Mirrors src/lib/money.ts computeStayTotals(). Never store these numbers.';

-- stay_night_revenue: unchanged from 001 (rebuilt because it reads stay_totals).
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
-- Access: grants (views lose theirs when dropped) and LIVE policies.
-- Demo anon policies are in supabase/demo_policies.sql, NOT here.
-- -----------------------------------------------------------------------------
alter table public.referrers enable row level security;

grant select, insert, update on public.referrers to anon, authenticated;
revoke delete on public.referrers from anon, authenticated;
grant select on public.stay_totals, public.stay_night_revenue to anon, authenticated;

create policy live_referrers_select on public.referrers for select to authenticated using (public.is_allowed_user());
create policy live_referrers_insert on public.referrers for insert to authenticated with check (public.is_allowed_user());
create policy live_referrers_update on public.referrers for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

-- -----------------------------------------------------------------------------
-- create_booking, v2. Same as 002 except:
--   "stay": { ..., "sources": ["Referral", "WhatsApp"] }   (no driver_room)
--   "referrer": { "id": uuid }                    an existing referrer, or
--               { "name": "...", "phone": "+91…" } a new one (phone optional;
--                                                  a known phone reuses that referrer;
--                                                  with no phone, a name only one
--                                                  referrer has reuses them), or
--               null
-- A referrer is only saved when "Referral" is one of the sources.
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

  -- Sources: trimmed, blanks dropped, duplicates removed, first-seen order kept.
  -- The old single "source" (previous app version) still works.
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

  -- Guest: the phone number is the key (unchanged from 002).
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

  -- Referrer: only for a Referral booking. An id picks an existing one; a name
  -- adds a new one (or reuses the referrer with that phone number).
  if 'Referral' = any (srcs) and jsonb_typeof(ref) = 'object' then
    if nullif(ref ->> 'id', '') is not null then
      r_id := (ref ->> 'id')::uuid;
    elsif nullif(trim(ref ->> 'name'), '') is not null then
      if nullif(trim(ref ->> 'phone'), '') is not null then
        select id into r_id from public.referrers where phone = trim(ref ->> 'phone');
      elsif (select count(*) from public.referrers
              where lower(name) = lower(trim(ref ->> 'name')) and archived_at is null) = 1 then
        -- Same name typed again (no phone) and only one referrer has it: the same person.
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
      'advance',
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
