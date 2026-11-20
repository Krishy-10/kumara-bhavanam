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
-- The money guards still hold in demo: payments, charges, commissions and expenses cannot be deleted
-- or edited (only voided), bill numbers come from the database, and
-- confirmed / checked-in stays cannot overlap.
--
-- Run after the migrations (001–006). Safe to re-run: it removes its own
-- demo_anon_* policies first, then creates them all again.
-- =============================================================================

begin;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and policyname like 'demo\_anon\_%'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

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

create policy demo_anon_referrers_select on public.referrers for select to anon using (true);
create policy demo_anon_referrers_insert on public.referrers for insert to anon with check (true);
create policy demo_anon_referrers_update on public.referrers for update to anon using (true) with check (true);

create policy demo_anon_commissions_select on public.commissions for select to anon using (true);
create policy demo_anon_commissions_insert on public.commissions for insert to anon with check (true);
create policy demo_anon_commissions_void   on public.commissions for update to anon using (true) with check (true);

create policy demo_anon_commission_payouts_select on public.commission_payouts for select to anon using (true);
create policy demo_anon_commission_payouts_insert on public.commission_payouts for insert to anon with check (true);
create policy demo_anon_commission_payouts_void   on public.commission_payouts for update to anon using (true) with check (true);

create policy demo_anon_checklist_items_select on public.checklist_items for select to anon using (true);
create policy demo_anon_checklist_items_insert on public.checklist_items for insert to anon with check (true);
create policy demo_anon_checklist_items_update on public.checklist_items for update to anon using (true) with check (true);

create policy demo_anon_checklist_ticks_select on public.checklist_ticks for select to anon using (true);
create policy demo_anon_checklist_ticks_insert on public.checklist_ticks for insert to anon with check (true);
create policy demo_anon_checklist_ticks_delete on public.checklist_ticks for delete to anon using (true);

create policy demo_anon_tasks_select on public.tasks for select to anon using (true);
create policy demo_anon_tasks_insert on public.tasks for insert to anon with check (true);
create policy demo_anon_tasks_update on public.tasks for update to anon using (true) with check (true);
create policy demo_anon_tasks_delete on public.tasks for delete to anon using (true);

create policy demo_anon_expenses_select on public.expenses for select to anon using (true);
create policy demo_anon_expenses_insert on public.expenses for insert to anon with check (true);
create policy demo_anon_expenses_void   on public.expenses for update to anon using (true) with check (true);

commit;
