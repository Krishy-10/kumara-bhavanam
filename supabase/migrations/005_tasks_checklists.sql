-- =============================================================================
-- Kumara Bhavanam · 005_tasks_checklists.sql   (decided with the owner, 21 Nov 2026)
--   * Checklists: one shared list of items for "Before check-in" and one for
--     "At check-out", edited on either phone. Each stay gets its own ticks
--     (who ticked, when). Ticking is not money: an untick deletes the tick.
--     Items are archived, never deleted, so old ticks keep their label.
--     Checklists warn in the app; they never block a check-in or check-out.
--       checklist_items  stage, label, sort_order, archived_at
--       checklist_ticks  one per (stay, item)
--   * Tasks: the owners' own to-dos. Text, a due date, optionally who it is
--     for and a linked stay. Ticked done (who, when). Can be edited or deleted.
--   * Reminders (arrival prep, balance to collect) are NOT stored: the app
--     works them out from stays and ticks. Nothing is ever sent.
--   * No money in this file.
--
-- Run once, after 001–004, in the Supabase SQL editor. One transaction.
-- On the DEMO project, run supabase/demo_policies.sql again afterwards.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- checklist_items: the shared list
-- -----------------------------------------------------------------------------
create table public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  stage        text not null check (stage in ('before_check_in', 'at_check_out')),
  label        text not null check (length(trim(label)) between 1 and 120),
  sort_order   integer not null default 100,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0)
);

create index checklist_items_stage_idx on public.checklist_items (stage, sort_order) where archived_at is null;

comment on table public.checklist_items is
  'Shared checklist for every stay: before check-in and at check-out. Archived, never deleted.';

-- Items are archived, never deleted (ticks point at them).
create or replace function public.guard_checklist_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Checklist items are never deleted; remove them from the list instead.'
    using errcode = 'restrict_violation';
end;
$$;

create trigger checklist_items_no_delete before delete on public.checklist_items
  for each row execute function public.guard_checklist_item();

-- Starter items; either owner can rename, reorder, add or remove them.
insert into public.checklist_items (stage, label, sort_order, created_by) values
  ('before_check_in', 'Sweep and mop every room',              10, 'App setup'),
  ('before_check_in', 'Clean the bathrooms',                   20, 'App setup'),
  ('before_check_in', 'Fresh bedsheets and pillow covers',     30, 'App setup'),
  ('before_check_in', 'Fresh towels and soap',                 40, 'App setup'),
  ('before_check_in', 'Fill the drinking water',               50, 'App setup'),
  ('before_check_in', 'Check AC, fans, lights and geyser work', 60, 'App setup'),
  ('before_check_in', 'Remotes in place, batteries working',   70, 'App setup'),
  ('before_check_in', 'Keys ready',                            80, 'App setup'),
  ('at_check_out',    'Collect the keys',                      10, 'App setup'),
  ('at_check_out',    'Look for anything left behind',         20, 'App setup'),
  ('at_check_out',    'Check for any damage',                  30, 'App setup'),
  ('at_check_out',    'Switch off AC, fans, lights and geyser', 40, 'App setup'),
  ('at_check_out',    'Lock up',                               50, 'App setup');

-- -----------------------------------------------------------------------------
-- checklist_ticks: one per stay and item
-- -----------------------------------------------------------------------------
create table public.checklist_ticks (
  id          uuid primary key default gen_random_uuid(),
  stay_id     uuid not null references public.stays (id) on delete restrict,
  item_id     uuid not null references public.checklist_items (id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  text not null check (length(trim(created_by)) > 0),
  unique (stay_id, item_id)
);

comment on table public.checklist_ticks is
  'A ticked checklist item for one stay: who ticked it (created_by) and when (created_at). Unticking deletes the row.';

-- -----------------------------------------------------------------------------
-- tasks: the owners' own to-dos
-- -----------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) between 1 and 200),
  due_on       date not null,
  for_person   text check (for_person is null or length(trim(for_person)) > 0),
  stay_id      uuid references public.stays (id) on delete restrict,
  done_at      timestamptz,
  done_by      text,
  created_at   timestamptz not null default now(),
  created_by   text not null check (length(trim(created_by)) > 0),

  constraint tasks_done_has_by check ((done_at is null) = (done_by is null))
);

create index tasks_open_idx on public.tasks (due_on) where done_at is null;
create index tasks_stay_idx on public.tasks (stay_id) where stay_id is not null;

comment on table public.tasks is
  'In-app to-dos with a due date (Asia/Kolkata), optionally for one person and linked to a stay. Nothing is sent.';

-- -----------------------------------------------------------------------------
-- Access: grants and LIVE policies. Demo anon policies: supabase/demo_policies.sql.
-- -----------------------------------------------------------------------------
alter table public.checklist_items enable row level security;
alter table public.checklist_ticks enable row level security;
alter table public.tasks enable row level security;

grant select, insert, update on public.checklist_items to anon, authenticated;
revoke delete, truncate on public.checklist_items from anon, authenticated;
grant select, insert, delete on public.checklist_ticks to anon, authenticated;
revoke update, truncate on public.checklist_ticks from anon, authenticated;
grant select, insert, update, delete on public.tasks to anon, authenticated;
revoke truncate on public.tasks from anon, authenticated;

create policy live_checklist_items_select on public.checklist_items for select to authenticated using (public.is_allowed_user());
create policy live_checklist_items_insert on public.checklist_items for insert to authenticated with check (public.is_allowed_user());
create policy live_checklist_items_update on public.checklist_items for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy live_checklist_ticks_select on public.checklist_ticks for select to authenticated using (public.is_allowed_user());
create policy live_checklist_ticks_insert on public.checklist_ticks for insert to authenticated with check (public.is_allowed_user());
create policy live_checklist_ticks_delete on public.checklist_ticks for delete to authenticated using (public.is_allowed_user());

create policy live_tasks_select on public.tasks for select to authenticated using (public.is_allowed_user());
create policy live_tasks_insert on public.tasks for insert to authenticated with check (public.is_allowed_user());
create policy live_tasks_update on public.tasks for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());
create policy live_tasks_delete on public.tasks for delete to authenticated using (public.is_allowed_user());

commit;
