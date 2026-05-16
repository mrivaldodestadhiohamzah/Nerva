-- Optional hardening migration for Supabase.
-- The app works without this by storing the actual stress percent in encrypted protected metadata
-- when the existing stress_percent column is numeric. Run this if you want stress_percent
-- itself to store ciphertext instead of null for new encrypted rows.
-- The backend uses the service role key and enforces ownership in API queries.
-- These policies deny direct anon/authenticated table reads so users must go through the backend.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'history' and column_name = 'stress_level'
  ) then
    execute 'alter table public.history alter column stress_level type text using stress_level::text';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'history' and column_name = 'stress_percent'
  ) then
    execute 'alter table public.history alter column stress_percent type text using stress_percent::text';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'history' and column_name = 'emotion'
  ) then
    execute 'alter table public.history alter column emotion type text using emotion::text';
  end if;
end $$;

alter table public.history enable row level security;
alter table public.history force row level security;

drop policy if exists history_no_direct_select on public.history;
drop policy if exists history_no_direct_insert on public.history;
drop policy if exists history_no_direct_update on public.history;
drop policy if exists history_no_direct_delete on public.history;

create policy history_no_direct_select
on public.history for select
to anon, authenticated
using (false);

create policy history_no_direct_insert
on public.history for insert
to anon, authenticated
with check (false);

create policy history_no_direct_update
on public.history for update
to anon, authenticated
using (false)
with check (false);

create policy history_no_direct_delete
on public.history for delete
to anon, authenticated
using (false);
