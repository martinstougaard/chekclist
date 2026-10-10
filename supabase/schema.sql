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

-- Én række pr. afkrydset (done) eller irrelevant (na) trin.
-- Mangler der en række, er trinnet åbent.
-- Enten task_id (opgave uden underopgaver) eller subtask_id er udfyldt.
create table public.site_progress (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  environment text not null check (environment in ('test', 'prod')),
  task_id     uuid references public.tasks(id) on delete cascade,
  subtask_id  uuid references public.subtasks(id) on delete cascade,
  status      text not null check (status in ('done', 'na')),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  check ((task_id is null) <> (subtask_id is null)),
  unique (site_id, environment, task_id),
  unique (site_id, environment, subtask_id)
);
create index site_progress_site_idx on public.site_progress (site_id);

-- Kommentarer: på site (task_id og subtask_id tomme), på opgave eller på underopgave.
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  environment text check (environment in ('test', 'prod')),
  task_id     uuid references public.tasks(id) on delete cascade,
  subtask_id  uuid references public.subtasks(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  check (task_id is null or subtask_id is null)
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

-- ---------- Realtime (live opdatering når en kollega krydser af) -----

do $$
begin
  alter publication supabase_realtime add table public.site_progress;
  alter publication supabase_realtime add table public.comments;
  alter publication supabase_realtime add table public.sites;
exception when others then
  raise notice 'Realtime-publikation kunne ikke opdateres (kan ignoreres): %', sqlerrm;
end $$;
