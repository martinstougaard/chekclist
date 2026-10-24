-- =====================================================================
-- Opdatering 004: Spørgsmål efter go-live
--
-- Kør hele filen i Supabase → SQL Editor (én gang, på den database der
-- allerede kører). Den er sikker at køre igen, og den ændrer ikke eller
-- sletter eksisterende data.
-- Nye installationer skal ikke bruge den: der indeholder schema.sql allerede alt.
-- =====================================================================

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

-- Live opdatering af spørgsmål efter go-live
do $$
begin
  alter publication supabase_realtime add table public.golive_issues;
exception when others then
  raise notice 'Realtime for golive_issues kunne ikke slås til (kan ignoreres): %', sqlerrm;
end $$;
