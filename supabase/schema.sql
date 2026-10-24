-- =====================================================================
-- WMS Site-tjekliste: databaseskema til Supabase
-- Kør hele filen i Supabase → SQL Editor (én gang).
-- =====================================================================

-- ---------- Tabeller -------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null,
  role        text not null default 'user' check (role in ('admin', 'user')),
  created_at  timestamptz not null default now()
);

create table public.sections (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections(id) on delete cascade,
  title       text not null,
  description text not null default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  title       text not null,
  description text not null default '',
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.sites (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  responsible_id uuid references public.profiles(id) on delete set null,
  deadline       date,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Ekstra opgaver, der kun gælder ét site (ud over standardlisten).
create table public.site_tasks (
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
create index site_tasks_site_idx on public.site_tasks (site_id);

-- Én række pr. afkrydset (done) eller irrelevant (na) trin.
-- Mangler der en række, er trinnet åbent.
-- Præcis én af task_id (opgave uden underopgaver), subtask_id (underopgave)
-- eller site_task_id (ekstra opgave på sitet) er udfyldt.
create table public.site_progress (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  environment text not null check (environment in ('test', 'prod')),
  task_id     uuid references public.tasks(id) on delete cascade,
  subtask_id  uuid references public.subtasks(id) on delete cascade,
  site_task_id uuid references public.site_tasks(id) on delete cascade,
  status      text not null check (status in ('done', 'na')),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint site_progress_one_target check (num_nonnulls(task_id, subtask_id, site_task_id) = 1),
  unique (site_id, environment, task_id),
  unique (site_id, environment, subtask_id),
  constraint site_progress_site_task_uq unique (site_id, environment, site_task_id)
);
create index site_progress_site_idx on public.site_progress (site_id);

-- Kommentarer: på site (alle tre mål tomme), på opgave, underopgave eller ekstra opgave.
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  environment text check (environment in ('test', 'prod')),
  task_id     uuid references public.tasks(id) on delete cascade,
  subtask_id  uuid references public.subtasks(id) on delete cascade,
  site_task_id uuid references public.site_tasks(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  constraint comments_one_target check (num_nonnulls(task_id, subtask_id, site_task_id) <= 1)
);
create index comments_site_idx on public.comments (site_id);

-- ---------- Hjælpefunktioner ----------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Opret profil automatisk, når en bruger oprettes (invitation eller manuelt).
-- Den allerførste bruger bliver administrator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'user' else 'admin' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security --------------------------------------

alter table public.profiles      enable row level security;
alter table public.sections      enable row level security;
alter table public.tasks         enable row level security;
alter table public.subtasks      enable row level security;
alter table public.sites         enable row level security;
alter table public.site_tasks    enable row level security;
alter table public.site_progress enable row level security;
alter table public.comments      enable row level security;

-- Profiler: alle loggede brugere kan se dem. Man kan rette sit eget navn,
-- men kun administratorer kan ændre roller.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (id = auth.uid() and role = public.my_role()));

-- Opgavelisten: alle kan læse, kun administratorer kan ændre.
create policy "sections_select" on public.sections for select to authenticated using (true);
create policy "sections_admin"  on public.sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "tasks_select" on public.tasks for select to authenticated using (true);
create policy "tasks_admin"  on public.tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "subtasks_select" on public.subtasks for select to authenticated using (true);
create policy "subtasks_admin"  on public.subtasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Sites: alle loggede brugere kan oprette og rette. Sletning: administrator eller opretter.
create policy "sites_select" on public.sites for select to authenticated using (true);
create policy "sites_insert" on public.sites for insert to authenticated
  with check (created_by = auth.uid());
create policy "sites_update" on public.sites for update to authenticated
  using (true) with check (true);
create policy "sites_delete" on public.sites for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- Ekstra opgaver pr. site: alle loggede brugere kan læse, oprette, rette og slette.
create policy "site_tasks_select" on public.site_tasks for select to authenticated using (true);
create policy "site_tasks_insert" on public.site_tasks for insert to authenticated
  with check (created_by = auth.uid());
create policy "site_tasks_update" on public.site_tasks for update to authenticated
  using (true) with check (true);
create policy "site_tasks_delete" on public.site_tasks for delete to authenticated using (true);

-- Afkrydsninger: alle loggede brugere.
create policy "progress_select" on public.site_progress for select to authenticated using (true);
create policy "progress_insert" on public.site_progress for insert to authenticated
  with check (updated_by = auth.uid());
create policy "progress_update" on public.site_progress for update to authenticated
  using (true) with check (updated_by = auth.uid());
create policy "progress_delete" on public.site_progress for delete to authenticated using (true);

-- Kommentarer: alle kan læse og skrive; man kan slette sine egne (administrator alle).
create policy "comments_select" on public.comments for select to authenticated using (true);
create policy "comments_insert" on public.comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "comments_delete" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ---------- Go-live ----------
-- Standardhandlinger (oprettes af administratorer), ét go-live pr. site med tidsstempler pr. handling.

create table if not exists public.golive_actions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  -- true = kører sideløbende (kan startes og afsluttes uafhængigt af rækkefølgen)
  parallel    boolean not null default false,
  position    int  not null default 0,
  kind        text not null default 'golive' check (kind in ('technical', 'golive')),
  created_at  timestamptz not null default now()
);

create table if not exists public.golive_runs (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  kind        text not null default 'golive' check (kind in ('technical', 'golive')),
  started_at  timestamptz not null default now(),
  started_by  uuid references public.profiles(id) on delete set null,
  finished_at timestamptz,
  constraint golive_runs_site_kind_key unique (site_id, kind)
);

-- Hvert go-live får sin egen kopi af handlingerne (titel, rækkefølge, sideløbende),
-- så senere ændringer på handlingslisten ikke ændrer en historisk måling.
create table if not exists public.golive_steps (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  kind        text not null default 'golive' check (kind in ('technical', 'golive')),
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
create index if not exists golive_steps_site_kind_idx on public.golive_steps (site_id, kind);

create table if not exists public.golive_comments (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites(id) on delete cascade,
  kind       text not null default 'golive' check (kind in ('technical', 'golive')),
  body       text not null check (length(btrim(body)) > 0),
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists golive_comments_site_idx on public.golive_comments (site_id);
create index if not exists golive_comments_site_kind_idx on public.golive_comments (site_id, kind);

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

-- ---------- Spørgsmål efter go-live ----------
-- Spørgsmål fra brugerne på et site efter go-live, løsningen og en handling, der kan forhindre det næste gang.

create table if not exists public.golive_issues (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id) on delete cascade,
  question        text not null check (length(btrim(question)) > 0),
  asked_by        text not null default '',          -- hvem på sitet, der spurgte (fri tekst)
  answer          text not null default '',          -- løsningen
  prevention      text not null default '',          -- handling, så vi undgår det næste gang
  prevention_done boolean not null default false,
  status          text not null default 'open' check (status in ('open', 'solved')),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  solved_at       timestamptz
);
create index if not exists golive_issues_site_idx on public.golive_issues (site_id);

alter table public.golive_issues enable row level security;

drop policy if exists "golive_issues_select" on public.golive_issues;
drop policy if exists "golive_issues_insert" on public.golive_issues;
drop policy if exists "golive_issues_update" on public.golive_issues;
drop policy if exists "golive_issues_delete" on public.golive_issues;
create policy "golive_issues_select" on public.golive_issues for select to authenticated using (true);
create policy "golive_issues_insert" on public.golive_issues for insert to authenticated
  with check (created_by = auth.uid());
create policy "golive_issues_update" on public.golive_issues for update to authenticated using (true) with check (true);
create policy "golive_issues_delete" on public.golive_issues for delete to authenticated using (true);

-- ---------- Realtime (live opdatering når en kollega krydser af) -----

do $$
begin
  alter publication supabase_realtime add table public.site_progress;
  alter publication supabase_realtime add table public.comments;
  alter publication supabase_realtime add table public.sites;
  alter publication supabase_realtime add table public.site_tasks;
exception when others then
  raise notice 'Realtime-publikation kunne ikke opdateres (kan ignoreres): %', sqlerrm;
end $$;

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

-- Live opdatering af spørgsmål efter go-live
do $$
begin
  alter publication supabase_realtime add table public.golive_issues;
exception when others then
  raise notice 'Realtime for golive_issues kunne ikke slås til (kan ignoreres): %', sqlerrm;
end $$;
