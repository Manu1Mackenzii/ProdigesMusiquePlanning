-- Exécuter dans le SQL Editor de Supabase avant le fichier privé d'initialisation.
create table if not exists public.pm_members (
 id integer primary key, prenom text not null, nom text not null, sexe text,
 pupitre text not null, role text, statut text, pin_hash text not null
);
create table if not exists public.pm_months (
 month text primary key check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 events jsonb not null default '[]', revision integer not null default 0
);
create table if not exists public.pm_answers (
 month text references public.pm_months(month) on delete cascade,
 event_id text not null, member_id integer references public.pm_members(id),
 status text not null check(status in ('disponible','indisponible','repétition','a_definir')),
 updated_at timestamptz default now(), primary key(month,event_id,member_id)
);
create table if not exists public.pm_studio (
 booking_date date primary key, title text not null, time text not null, type text not null,
 revision integer not null default 1
);
create table if not exists public.pm_settings (key text primary key,value jsonb not null);
create table if not exists public.pm_login_attempts (key text primary key, starts_at timestamptz not null default now(), attempts integer not null default 0);
alter table public.pm_members enable row level security;
alter table public.pm_months enable row level security;
alter table public.pm_answers enable row level security;
alter table public.pm_studio enable row level security;
alter table public.pm_settings enable row level security;
alter table public.pm_login_attempts enable row level security;
revoke all on public.pm_members,public.pm_months,public.pm_answers,public.pm_studio,public.pm_settings,public.pm_login_attempts from anon,authenticated;
grant all on public.pm_members,public.pm_months,public.pm_answers,public.pm_studio,public.pm_settings,public.pm_login_attempts to service_role;
create or replace function public.pm_consume_login_attempt(p_key text) returns boolean
language plpgsql security definer set search_path=public as $$
declare result integer;
begin
 delete from public.pm_login_attempts where starts_at < now()-interval '1 day';
 insert into public.pm_login_attempts(key,starts_at,attempts) values(p_key,now(),1)
 on conflict(key) do update set
 attempts=case when pm_login_attempts.starts_at < now()-interval '15 minutes' then 1 else pm_login_attempts.attempts+1 end,
 starts_at=case when pm_login_attempts.starts_at < now()-interval '15 minutes' then now() else pm_login_attempts.starts_at end
 returning attempts into result;
 return result<=10;
end $$;
revoke all on function public.pm_consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.pm_consume_login_attempt(text) to service_role;
-- Mise à jour atomique des colonnes et suppression des réponses des dates retirées.
create or replace function public.pm_save_dates(p_month text,p_events jsonb,p_revision integer) returns integer
language plpgsql security definer set search_path=public as $$
declare next_revision integer;
begin
 insert into public.pm_months(month,events,revision) values(p_month,'[]',0) on conflict(month) do nothing;
 update public.pm_months set events=p_events,revision=revision+1
 where month=p_month and revision=p_revision returning revision into next_revision;
 if next_revision is null then return -1; end if;
 delete from public.pm_answers a where a.month=p_month and not exists
 (select 1 from jsonb_array_elements(p_events) e where e->>'id'=a.event_id);
 return next_revision;
end $$;
revoke all on function public.pm_save_dates(text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.pm_save_dates(text,jsonb,integer) to service_role;
