-- Trade Journal: compatible upgrade for the earlier journal_cloud schema.
-- Run the whole script in Supabase SQL Editor. Existing snapshots are preserved.
-- 2026-10-09 v2: save history. Every successful overwrite keeps the previous
-- version in journal_cloud_history (latest 5 per user/market) and journal_restore
-- can bring one back as a new revision. Revision conflict protection is unchanged.
begin;
create table if not exists public.journal_cloud (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check(scope in ('US','HL')),
 revision bigint not null default 1 check(revision>0),
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,scope)
);
alter table public.journal_cloud enable row level security;
revoke all on public.journal_cloud from public,anon,authenticated;
grant select on public.journal_cloud to authenticated;
drop policy if exists journal_own_select on public.journal_cloud;
create policy journal_own_select on public.journal_cloud for select to authenticated
 using(user_id=(select auth.uid()));
-- Existing write policies do not grant table privileges. Remove them for clarity.
drop policy if exists journal_own_insert on public.journal_cloud;
drop policy if exists journal_own_update on public.journal_cloud;

-- Previous versions. Written only by the functions below.
create table if not exists public.journal_cloud_history (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check(scope in ('US','HL')),
 revision bigint not null check(revision>0),
 payload jsonb not null,
 trade_count integer not null default 0,
 saved_at timestamptz not null,
 archived_at timestamptz not null default now(),
 unique(user_id,scope,revision)
);
create index if not exists journal_cloud_history_recent on public.journal_cloud_history(user_id,scope,revision desc);
alter table public.journal_cloud_history enable row level security;
revoke all on public.journal_cloud_history from public,anon,authenticated;
grant select on public.journal_cloud_history to authenticated;
drop policy if exists journal_history_own_select on public.journal_cloud_history;
create policy journal_history_own_select on public.journal_cloud_history for select to authenticated
 using(user_id=(select auth.uid()));

-- Internal: archive the locked current row, keep the newest 5, write the new payload.
create or replace function public.journal_archive_and_write(p_user uuid,p_scope text,p_old_revision bigint,p_old_payload jsonb,p_old_updated timestamptz,p_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
 insert into public.journal_cloud_history(user_id,scope,revision,payload,trade_count,saved_at)
 values(p_user,p_scope,p_old_revision,p_old_payload,
  case when jsonb_typeof(p_old_payload->'trades')='array' then jsonb_array_length(p_old_payload->'trades') else 0 end,
  p_old_updated)
 on conflict(user_id,scope,revision) do nothing;
 update public.journal_cloud set payload=p_payload,revision=revision+1,updated_at=now()
 where user_id=p_user and scope=p_scope and revision=p_old_revision
 returning revision into v_revision;
 delete from public.journal_cloud_history h
 where h.user_id=p_user and h.scope=p_scope and h.id not in(
  select k.id from public.journal_cloud_history k where k.user_id=p_user and k.scope=p_scope order by k.revision desc limit 5);
 return v_revision;
end $$;
revoke all on function public.journal_archive_and_write(uuid,text,bigint,jsonb,timestamptz,jsonb) from public,anon,authenticated;

create or replace function public.journal_cas(p_scope text,p_expected_revision bigint,p_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_revision bigint; v_cur record;
begin
 if v_user is null then raise exception 'login required' using errcode='28000'; end if;
 if p_scope is null or p_scope not in ('US','HL') then raise exception 'invalid scope'; end if;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991 then raise exception 'invalid revision'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid payload'; end if;
 if (p_payload->>'format') is distinct from (case when p_scope='HL' then 'trade-journal-hyperliquid' else 'trade-journal-usd' end)
 or (p_payload->>'currency') is distinct from (case when p_scope='HL' then 'USDC' else 'USD' end)
 or jsonb_typeof(p_payload->'trades') is distinct from 'array'
 or jsonb_typeof(p_payload->'settings') is distinct from 'object'
 then raise exception 'scope and payload mismatch'; end if;
 if octet_length(p_payload::text)>25*1024*1024 then raise exception 'snapshot exceeds 25 MiB'; end if;
 if p_expected_revision=0 then
  insert into public.journal_cloud(user_id,scope,revision,payload,updated_at)
  values(v_user,p_scope,1,p_payload,now()) on conflict(user_id,scope) do nothing
  returning revision into v_revision;
  return v_revision; -- null means a snapshot already exists; nothing was overwritten.
 end if;
 select revision,payload,updated_at into v_cur from public.journal_cloud
  where user_id=v_user and scope=p_scope for update;
 if not found or v_cur.revision<>p_expected_revision then return null; end if; -- conflict; no row was overwritten.
 return public.journal_archive_and_write(v_user,p_scope,v_cur.revision,v_cur.payload,v_cur.updated_at,p_payload);
end $$;
revoke all on function public.journal_cas(text,bigint,jsonb) from public,anon;
grant execute on function public.journal_cas(text,bigint,jsonb) to authenticated;

-- Restore one of your own previous versions as a new revision. The version being
-- replaced is archived too, so a restore can itself be undone.
create or replace function public.journal_restore(p_scope text,p_history_id bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_old record; v_cur record;
begin
 if v_user is null then raise exception 'login required' using errcode='28000'; end if;
 if p_scope is null or p_scope not in ('US','HL') then raise exception 'invalid scope'; end if;
 select payload into v_old from public.journal_cloud_history
  where id=p_history_id and user_id=v_user and scope=p_scope;
 if not found then raise exception 'history version not found'; end if;
 select revision,payload,updated_at into v_cur from public.journal_cloud
  where user_id=v_user and scope=p_scope for update;
 if not found then raise exception 'no current snapshot'; end if;
 return public.journal_archive_and_write(v_user,p_scope,v_cur.revision,v_cur.payload,v_cur.updated_at,v_old.payload);
end $$;
revoke all on function public.journal_restore(text,bigint) from public,anon;
grant execute on function public.journal_restore(text,bigint) to authenticated;
commit;
