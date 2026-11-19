-- =============================================================================
-- !!!  DEMO ONLY  !!!   Run this on the kb-demo Supabase project ONLY.
-- =============================================================================
-- Lets the public `anon` role (the publishable key that ships inside the app)
-- read and write the app tables, so the demo works with no sign-in.
--
-- Anyone who has the demo app's URL can get that key from the app's code, so
-- anything in the demo database is effectively public:
--   * Keep only sample data here. No real guest names or phone numbers.
--   * Put the demo site behind Cloudflare Access (see DEPLOY.md).
--   * NEVER run this file on the live project (kb-live). Live access comes
--     only from the `live_*` policies in migrations/001_init.sql.
--
-- It lives outside supabase/migrations on purpose, so `supabase db push`
-- never applies it anywhere by accident.
--
-- The money guards still hold in demo: payments and charges cannot be deleted
-- or edited (only voided), bill numbers come from the database, and
-- confirmed / checked-in stays cannot overlap.
-- =============================================================================

begin;

create policy demo_anon_guests_select on public.guests for select to anon using (true);
create policy demo_anon_guests_insert on public.guests for insert to anon with check (true);
create policy demo_anon_guests_update on public.guests for update to anon using (true) with check (true);

create policy demo_anon_stays_select on public.stays for select to anon using (true);
create policy demo_anon_stays_insert on public.stays for insert to anon with check (true);
create policy demo_anon_stays_update on public.stays for update to anon using (true) with check (true);

create policy demo_anon_charges_select on public.charges for select to anon using (true);
create policy demo_anon_charges_insert on public.charges for insert to anon with check (true);
create policy demo_anon_charges_void   on public.charges for update to anon using (true) with check (true);

create policy demo_anon_payments_select on public.payments for select to anon using (true);
create policy demo_anon_payments_insert on public.payments for insert to anon with check (true);
create policy demo_anon_payments_void   on public.payments for update to anon using (true) with check (true);

create policy demo_anon_id_checks_select on public.id_checks for select to anon using (true);
create policy demo_anon_id_checks_insert on public.id_checks for insert to anon with check (true);
create policy demo_anon_id_checks_update on public.id_checks for update to anon using (true) with check (true);
create policy demo_anon_id_checks_delete on public.id_checks for delete to anon using (true);

create policy demo_anon_blocked_select on public.blocked_dates for select to anon using (true);
create policy demo_anon_blocked_insert on public.blocked_dates for insert to anon with check (true);
create policy demo_anon_blocked_update on public.blocked_dates for update to anon using (true) with check (true);
create policy demo_anon_blocked_delete on public.blocked_dates for delete to anon using (true);

create policy demo_anon_templates_select on public.message_templates for select to anon using (true);
create policy demo_anon_templates_insert on public.message_templates for insert to anon with check (true);
create policy demo_anon_templates_update on public.message_templates for update to anon using (true) with check (true);

create policy demo_anon_settings_select on public.app_settings for select to anon using (true);
create policy demo_anon_settings_update on public.app_settings for update to anon using (true) with check (true);

commit;
