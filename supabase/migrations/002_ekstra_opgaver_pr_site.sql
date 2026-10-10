-- =====================================================================
-- Opdatering 002: ekstra opgaver, der kun gælder ét site
--
-- Kør hele filen i Supabase → SQL Editor (én gang, på den database der
-- allerede kører). Den er sikker at køre igen, og den ændrer ikke eller
-- sletter eksisterende data.
-- Nye installationer skal ikke bruge den: der indeholder schema.sql allerede alt.
-- =====================================================================

-- 1) Tabellen til ekstra opgaver
create table if not exists public.site_tasks (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  -- Hvor opgaven gælder: begge miljøer, kun test eller kun produktion
  environments text not null default 'both' check (environments in ('both', 'test', 'prod')),
  position     int  not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists site_tasks_site_idx on public.site_tasks (site_id);

-- 2) Afkrydsninger og kommentarer kan nu pege på en ekstra opgave
alter table public.site_progress
  add column if not exists site_task_id uuid references public.site_tasks(id) on delete cascade;
alter table public.comments
  add column if not exists site_task_id uuid references public.site_tasks(id) on delete cascade;

-- De gamle regler om, hvad en række peger på, erstattes af nye, der kender site_task_id
do $$
declare c record;
begin
  for c in
    select cl.relname as tbl, con.conname
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname in ('site_progress', 'comments')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%task_id%'
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

-- Afkrydsning: præcis ét mål (opgave, underopgave eller ekstra opgave)
alter table public.site_progress
  add constraint site_progress_one_target check (num_nonnulls(task_id, subtask_id, site_task_id) = 1);
-- Kommentar: højst ét mål (ingen = kommentar til hele sitet)
alter table public.comments
  add constraint comments_one_target check (num_nonnulls(task_id, subtask_id, site_task_id) <= 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_progress_site_task_uq') then
    alter table public.site_progress
      add constraint site_progress_site_task_uq unique (site_id, environment, site_task_id);
  end if;
end $$;

-- 3) Rettigheder: alle loggede brugere kan læse og ændre ekstra opgaver
alter table public.site_tasks enable row level security;

drop policy if exists "site_tasks_select" on public.site_tasks;
drop policy if exists "site_tasks_insert" on public.site_tasks;
drop policy if exists "site_tasks_update" on public.site_tasks;
drop policy if exists "site_tasks_delete" on public.site_tasks;
create policy "site_tasks_select" on public.site_tasks for select to authenticated using (true);
create policy "site_tasks_insert" on public.site_tasks for insert to authenticated
  with check (created_by = auth.uid());
create policy "site_tasks_update" on public.site_tasks for update to authenticated
  using (true) with check (true);
create policy "site_tasks_delete" on public.site_tasks for delete to authenticated using (true);

-- 4) Live opdatering
do $$
begin
  alter publication supabase_realtime add table public.site_tasks;
exception when others then
  raise notice 'Realtime-publikation kunne ikke opdateres (kan ignoreres): %', sqlerrm;
end $$;
