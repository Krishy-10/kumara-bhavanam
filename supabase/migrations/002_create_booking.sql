-- =============================================================================
-- Kumara Bhavanam · 002_create_booking.sql
-- One call saves a whole booking: the guest (found by phone, or created), the
-- stay, its extras and discounts, and the advance. All or nothing, so a phone
-- that loses signal halfway can never leave a stay without its advance.
--
-- SECURITY INVOKER: it runs with the caller's rights, so the same RLS policies
-- apply as for direct inserts (demo: anon; live: allow-listed users).
-- The overlap constraint, bill number trigger and every check still apply.
--
-- Payload (jsonb):
-- {
--   "created_by": "Krishna Kumar",
--   "guest":  { "phone": "+919843112345", "name": "...", "city": "...",
--               "email": null, "language": "en", "nationality": "Indian" },
--   "stay":   { "check_in": "2026-11-24", "check_out": "2026-11-26",
--               "guests_count": 6, "driver_room": false, "status": "confirmed",
--               "pricing_mode": "per_night", "nightly_rate": 5000, "fixed_amount": null,
--               "occasion": "Temple visit", "source": "Returning guest", "notes": null },
--   "charges": [ { "kind": "charge", "label": "Extra bedding", "amount": 500 } ],
--   "advance": { "amount": 2000, "mode": "upi", "paid_on": "2026-11-10", "reference": null }
-- }
-- Returns { "stay_id": uuid, "bill_no": "KB-2026-0045", "guest_id": uuid }.
-- =============================================================================

begin;

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
  ch       jsonb;
  g_id     uuid;
  s_id     uuid;
  bill     text;
begin
  if by_name is null then
    raise exception 'created_by is required' using errcode = 'not_null_violation';
  end if;

  -- Guest: the phone number is the key. A known number updates the details
  -- the owner just confirmed; a new number creates the guest.
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

  insert into public.stays (
    guest_id, check_in, check_out, guests_count, driver_room, status,
    pricing_mode, nightly_rate, fixed_amount, occasion, source, notes, created_by
  ) values (
    g_id,
    (s ->> 'check_in')::date,
    (s ->> 'check_out')::date,
    coalesce((s ->> 'guests_count')::integer, 2),
    coalesce((s ->> 'driver_room')::boolean, false),
    coalesce(s ->> 'status', 'confirmed'),
    s ->> 'pricing_mode',
    (s ->> 'nightly_rate')::integer,
    (s ->> 'fixed_amount')::integer,
    nullif(trim(s ->> 'occasion'), ''),
    nullif(trim(s ->> 'source'), ''),
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

  return jsonb_build_object('stay_id', s_id, 'bill_no', bill, 'guest_id', g_id);
end;
$$;

revoke all on function public.create_booking(jsonb) from public;
grant execute on function public.create_booking(jsonb) to anon, authenticated;

commit;
