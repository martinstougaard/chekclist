-- =====================================================================
-- Opdatering 005: Technical go-live som egen begivenhed
--
-- Kør hele filen i Supabase → SQL Editor (én gang, på den database der
-- allerede kører). Den er sikker at køre igen, og den ændrer ikke eller
-- sletter eksisterende data: alt, der findes i forvejen, bliver til "golive".
-- Nye installationer skal ikke bruge den: der indeholder schema.sql allerede alt.
-- =====================================================================

alter table public.golive_actions  add column if not exists kind text not null default 'golive';
alter table public.golive_runs     add column if not exists kind text not null default 'golive';
alter table public.golive_steps    add column if not exists kind text not null default 'golive';
alter table public.golive_comments add column if not exists kind text not null default 'golive';

do $$
declare t text;
begin
  foreach t in array array['golive_actions', 'golive_runs', 'golive_steps', 'golive_comments'] loop
    if not exists (
      select 1 from pg_constraint where conname = t || '_kind_check' and conrelid = ('public.' || t)::regclass
    ) then
      execute format('alter table public.%I add constraint %I check (kind in (''technical'', ''golive''))', t, t || '_kind_check');
    end if;
  end loop;
end $$;

-- Ét forløb pr. site pr. slags (før: ét pr. site)
alter table public.golive_runs drop constraint if exists golive_runs_site_id_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'golive_runs_site_kind_key') then
    alter table public.golive_runs add constraint golive_runs_site_kind_key unique (site_id, kind);
  end if;
end $$;

create index if not exists golive_steps_site_kind_idx on public.golive_steps (site_id, kind);
create index if not exists golive_comments_site_kind_idx on public.golive_comments (site_id, kind);
