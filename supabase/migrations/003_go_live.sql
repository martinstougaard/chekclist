-- =====================================================================
-- Opdatering 003: Go-live (handlinger, tidsmåling og kommentarer)
--
-- Kør hele filen i Supabase → SQL Editor (én gang, på den database der
-- allerede kører). Den er sikker at køre igen, og den ændrer ikke eller
-- sletter eksisterende data.
-- Nye installationer skal ikke bruge den: der indeholder schema.sql allerede alt.
-- =====================================================================

-- ---------- Go-live ----------
-- Standardhandlinger (oprettes af administratorer), ét go-live pr. site med tidsstempler pr. handling.

create table if not exists public.golive_actions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  -- true = kører sideløbende (kan startes og afsluttes uafhængigt af rækkefølgen)
  parallel    boolean not null default false,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.golive_runs (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null unique references public.sites(id) on delete cascade,
  started_at  timestamptz not null default now(),
  started_by  uuid references public.profiles(id) on delete set null,
  finished_at timestamptz
);

-- Hvert go-live får sin egen kopi af handlingerne (titel, rækkefølge, sideløbende),
-- så senere ændringer på handlingslisten ikke ændrer en historisk måling.
create table if not exists public.golive_steps (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  action_id   uuid references public.golive_actions(id) on delete set null,
  title       text not null,
  description text not null default '',
  position    int  not null default 0,
  parallel    boolean not null default false,
  started_at  timestamptz,
  started_by  uuid references public.profiles(id) on delete set null,
  finished_at timestamptz,
  finished_by uuid references public.profiles(id) on delete set null
);
create index if not exists golive_steps_site_idx on public.golive_steps (site_id);

create table if not exists public.golive_comments (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites(id) on delete cascade,
  body       text not null check (length(btrim(body)) > 0),
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists golive_comments_site_idx on public.golive_comments (site_id);

alter table public.golive_actions  enable row level security;
alter table public.golive_runs     enable row level security;
alter table public.golive_steps    enable row level security;
alter table public.golive_comments enable row level security;

drop policy if exists "golive_actions_select" on public.golive_actions;
drop policy if exists "golive_actions_admin"  on public.golive_actions;
create policy "golive_actions_select" on public.golive_actions for select to authenticated using (true);
create policy "golive_actions_admin"  on public.golive_actions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "golive_runs_select" on public.golive_runs;
drop policy if exists "golive_runs_insert" on public.golive_runs;
drop policy if exists "golive_runs_update" on public.golive_runs;
drop policy if exists "golive_runs_delete" on public.golive_runs;
create policy "golive_runs_select" on public.golive_runs for select to authenticated using (true);
create policy "golive_runs_insert" on public.golive_runs for insert to authenticated with check (true);
create policy "golive_runs_update" on public.golive_runs for update to authenticated using (true) with check (true);
create policy "golive_runs_delete" on public.golive_runs for delete to authenticated using (true);

drop policy if exists "golive_steps_select" on public.golive_steps;
drop policy if exists "golive_steps_insert" on public.golive_steps;
drop policy if exists "golive_steps_update" on public.golive_steps;
drop policy if exists "golive_steps_delete" on public.golive_steps;
create policy "golive_steps_select" on public.golive_steps for select to authenticated using (true);
create policy "golive_steps_insert" on public.golive_steps for insert to authenticated with check (true);
create policy "golive_steps_update" on public.golive_steps for update to authenticated using (true) with check (true);
create policy "golive_steps_delete" on public.golive_steps for delete to authenticated using (true);

drop policy if exists "golive_comments_select" on public.golive_comments;
drop policy if exists "golive_comments_insert" on public.golive_comments;
drop policy if exists "golive_comments_delete" on public.golive_comments;
create policy "golive_comments_select" on public.golive_comments for select to authenticated using (true);
create policy "golive_comments_insert" on public.golive_comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "golive_comments_delete" on public.golive_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Live opdatering af go-live (flere kan arbejde samtidigt)
do $$
declare t text;
begin
  foreach t in array array['golive_runs', 'golive_steps', 'golive_comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      raise notice 'Realtime for % kunne ikke slås til (kan ignoreres): %', t, sqlerrm;
    end;
  end loop;
end $$;
