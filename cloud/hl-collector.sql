-- Trade Journal v3: Hyperliquid auto-collection inside Supabase (no PC, no server).
-- Run ONCE in Supabase SQL Editor AFTER cloud.sql. Safe to run again (idempotent).
--
-- What it does
--  * pg_cron runs public.hl_collect_tick() every minute.
--  * The tick (a) ingests finished pg_net responses into hl_fills / hl_funding
--    (ON CONFLICT DO NOTHING, cursor advanced only after a valid response) and
--    (b) fires the next public Hyperliquid /info requests with pg_net:
--    userFillsByTime(startTime = cursor - 5 min, aggregateByTime=false) and
--    userFunding(startTime = cursor - 2 h, at most every 5 min unless paging).
--    The first run backfills from 0. A full page (2000 fills / 500 funding)
--    pages forward from the last returned timestamp on the next tick.
--  * The wallet address travels only in the POST body. No API key exists or is needed.
--  * App users can only READ rows of their own registered address. Every write
--    goes through the functions below.
-- Requires the pg_cron and pg_net extensions (Database > Extensions in the dashboard).
begin;

create extension if not exists pg_cron; -- @extension
create extension if not exists pg_net with schema extensions; -- @extension

-- 1. Watched address, one per app user ---------------------------------------
create table if not exists public.hl_watch (
 user_id uuid primary key references auth.users(id) on delete cascade,
 address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
 fills_cursor bigint not null default 0 check (fills_cursor >= 0),
 funding_cursor bigint not null default 0 check (funding_cursor >= 0),
 fills_more boolean not null default false,
 funding_more boolean not null default false,
 fills_requested_at timestamptz,
 funding_requested_at timestamptz,
 last_ok_at timestamptz,
 last_error text,
 last_error_at timestamptz,
 error_count integer not null default 0,
 retry_after timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists hl_watch_address on public.hl_watch(address);

-- 2. Raw fills (append-only) ---------------------------------------------------
create table if not exists public.hl_fills (
 id bigint generated always as identity primary key,
 address text not null check (address ~ '^0x[0-9a-f]{40}$'),
 tid bigint not null,
 time bigint not null,
 coin text not null,
 raw jsonb not null,
 inserted_at timestamptz not null default now(),
 unique (address, tid)
);
create index if not exists hl_fills_address_id on public.hl_fills(address, id);

-- 3. Raw funding payments (append-only) ---------------------------------------
create table if not exists public.hl_funding (
 id bigint generated always as identity primary key,
 address text not null check (address ~ '^0x[0-9a-f]{40}$'),
 time bigint not null,
 coin text not null,
 raw jsonb not null,
 inserted_at timestamptz not null default now(),
 unique (address, time, coin)
);
create index if not exists hl_funding_address_id on public.hl_funding(address, id);

-- 4. In-flight pg_net requests ---------------------------------------------------
create table if not exists public.hl_pending (
 request_id bigint primary key,
 user_id uuid not null references public.hl_watch(user_id) on delete cascade,
 address text not null,
 kind text not null check (kind in ('fills','funding')),
 start_time bigint not null,
 created_at timestamptz not null default now()
);
create index if not exists hl_pending_user_kind on public.hl_pending(user_id, kind);

-- 5. Privileges and row level security ----------------------------------------
alter table public.hl_watch enable row level security;
alter table public.hl_fills enable row level security;
alter table public.hl_funding enable row level security;
alter table public.hl_pending enable row level security;
revoke all on public.hl_watch, public.hl_fills, public.hl_funding, public.hl_pending from public, anon, authenticated;
grant select on public.hl_watch, public.hl_fills, public.hl_funding to authenticated;

drop policy if exists hl_watch_own_select on public.hl_watch;
create policy hl_watch_own_select on public.hl_watch for select to authenticated
 using (user_id = (select auth.uid()));
drop policy if exists hl_fills_own_select on public.hl_fills;
create policy hl_fills_own_select on public.hl_fills for select to authenticated
 using (address = (select w.address from public.hl_watch w where w.user_id = (select auth.uid())));
drop policy if exists hl_funding_own_select on public.hl_funding;
create policy hl_funding_own_select on public.hl_funding for select to authenticated
 using (address = (select w.address from public.hl_watch w where w.user_id = (select auth.uid())));
-- hl_pending: no policy, no grant. Internal only.

-- 6. Internal helpers ------------------------------------------------------------
create or replace function public.hl_note_error(p_user uuid, p_kind text, p_message text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.hl_watch set
  error_count = error_count + 1,
  last_error = left(p_kind || ': ' || coalesce(p_message,'unknown error'), 300),
  last_error_at = now(),
  -- 1, 2, 4, 8, 16, then 30 minutes between retries.
  retry_after = now() + make_interval(mins => least(30, power(2, least(error_count, 5))::int)),
  funding_requested_at = case when p_kind = 'funding' then null else funding_requested_at end, -- retry right after backoff
  updated_at = now()
 where user_id = p_user;
end $$;
revoke all on function public.hl_note_error(uuid,text,text) from public, anon, authenticated;

create or replace function public.hl_note_ok(p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.hl_watch set
  last_ok_at = now(),
  -- An error of the other request kind keeps its backoff until that kind succeeds.
  error_count = case when last_error is null or last_error like p_kind || ':%' then 0 else error_count end,
  retry_after = case when last_error is null or last_error like p_kind || ':%' then null else retry_after end,
  last_error = case when last_error like p_kind || ':%' then null else last_error end,
  updated_at = now()
 where user_id = p_user;
end $$;
revoke all on function public.hl_note_ok(uuid,text) from public, anon, authenticated;

-- 7. The collector tick (cron) ---------------------------------------------------
create or replace function public.hl_collect_tick()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c_url constant text := 'https://api.hyperliquid.xyz/info';
 c_fills_overlap constant bigint := 300000;    -- 5 minutes
 c_funding_overlap constant bigint := 7200000; -- 2 hours
 c_fills_cap constant int := 2000;
 c_funding_cap constant int := 500;
 p record; r record; w record;
 v_rows jsonb; v_n int; v_bad int; v_max bigint; v_ins int; v_cap int;
 v_full boolean; v_cursor bigint; v_start bigint; v_req bigint;
 v_ingested int := 0; v_fired int := 0; v_errors int := 0;
begin
 if not pg_try_advisory_xact_lock(hashtext('public.hl_collect_tick')) then
  return jsonb_build_object('skipped', true);
 end if;

 -- (a) ingest finished responses
 for p in select * from public.hl_pending order by request_id for update loop
  select resp.status_code, resp.content, resp.timed_out, resp.error_msg into r
   from net._http_response resp where resp.id = p.request_id;
  if not found then
   if p.created_at < now() - interval '10 minutes' then
    delete from public.hl_pending where request_id = p.request_id;
    perform public.hl_note_error(p.user_id, p.kind, '응답 없음(10분 초과)');
    v_errors := v_errors + 1;
   end if;
   continue; -- still in flight
  end if;
  delete from public.hl_pending where request_id = p.request_id;
  select * into w from public.hl_watch where user_id = p.user_id for update;
  if not found or w.address <> p.address then continue; end if; -- address changed meanwhile
  if coalesce(r.timed_out, false) or r.error_msg is not null or r.status_code is distinct from 200 then
   perform public.hl_note_error(p.user_id, p.kind,
    case when coalesce(r.timed_out,false) then '시간 초과'
         when r.error_msg is not null then left(r.error_msg, 150)
         when r.status_code = 429 then 'HTTP 429 요청 한도'
         else 'HTTP ' || coalesce(r.status_code::text,'?') || ' ' || left(coalesce(r.content,''), 120) end);
   v_errors := v_errors + 1;
   continue;
  end if;
  begin v_rows := r.content::jsonb; exception when others then v_rows := null; end;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
   perform public.hl_note_error(p.user_id, p.kind, '응답 형식 오류');
   v_errors := v_errors + 1;
   continue;
  end if;
  v_n := jsonb_array_length(v_rows);
  if p.kind = 'fills' then
   v_cap := c_fills_cap;
   select count(*) into v_bad from jsonb_array_elements(v_rows) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'tid') is distinct from 'number' or (e->>'tid') !~ '^[0-9]{1,18}$'
       or jsonb_typeof(e->'time') is distinct from 'number' or (e->>'time') !~ '^[0-9]{1,15}$'
       or jsonb_typeof(e->'coin') is distinct from 'string';
  else
   v_cap := c_funding_cap;
   select count(*) into v_bad from jsonb_array_elements(v_rows) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'time') is distinct from 'number' or (e->>'time') !~ '^[0-9]{1,15}$'
       or jsonb_typeof(e->'delta') is distinct from 'object'
       or (e->'delta'->>'type') is distinct from 'funding'
       or jsonb_typeof(e->'delta'->'coin') is distinct from 'string';
  end if;
  if v_bad > 0 then
   perform public.hl_note_error(p.user_id, p.kind, '알 수 없는 행 ' || v_bad || '건 · 반영 보류');
   v_errors := v_errors + 1;
   continue;
  end if;
  if p.kind = 'fills' then
   insert into public.hl_fills(address, tid, time, coin, raw)
    select p.address, (e->>'tid')::bigint, (e->>'time')::bigint, e->>'coin', e
    from jsonb_array_elements(v_rows) e
    on conflict (address, tid) do nothing;
  else
   insert into public.hl_funding(address, time, coin, raw)
    select p.address, (e->>'time')::bigint, e->'delta'->>'coin', e
    from jsonb_array_elements(v_rows) e
    on conflict (address, time, coin) do nothing;
  end if;
  get diagnostics v_ins = row_count;
  v_ingested := v_ingested + v_ins;
  select max((e->>'time')::bigint) into v_max from jsonb_array_elements(v_rows) e;
  v_full := v_n >= v_cap;
  v_cursor := greatest(case when p.kind = 'fills' then w.fills_cursor else w.funding_cursor end, coalesce(v_max, 0));
  if v_full and coalesce(v_max, p.start_time) <= p.start_time then
   -- A whole page shares one millisecond: never loop forever, but say so.
   v_cursor := p.start_time + 1;
   update public.hl_watch set last_error = p.kind || ': 같은 시각 ' || v_n || '건 이상 · 일부 누락 가능', last_error_at = now() where user_id = p.user_id;
  end if;
  if p.kind = 'fills' then
   update public.hl_watch set fills_cursor = v_cursor, fills_more = v_full, updated_at = now() where user_id = p.user_id;
  else
   update public.hl_watch set funding_cursor = v_cursor, funding_more = v_full, updated_at = now() where user_id = p.user_id;
  end if;
  if not (v_full and coalesce(v_max, p.start_time) <= p.start_time) then
   perform public.hl_note_ok(p.user_id, p.kind);
  end if;
 end loop;

 -- (b) fire next requests
 for w in select * from public.hl_watch where retry_after is null or retry_after <= now() for update loop
  if not exists (select 1 from public.hl_pending q where q.user_id = w.user_id and q.kind = 'fills') then
   v_start := case when w.fills_more then w.fills_cursor else greatest(0, w.fills_cursor - c_fills_overlap) end;
   v_req := net.http_post(
    url := c_url,
    body := jsonb_build_object('type','userFillsByTime','user',lower(w.address),'startTime',v_start,'aggregateByTime',false),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 20000);
   insert into public.hl_pending(request_id, user_id, address, kind, start_time) values (v_req, w.user_id, w.address, 'fills', v_start);
   update public.hl_watch set fills_requested_at = now() where user_id = w.user_id;
   v_fired := v_fired + 1;
  end if;
  if not exists (select 1 from public.hl_pending q where q.user_id = w.user_id and q.kind = 'funding')
     and (w.funding_more or w.funding_cursor = 0 or w.funding_requested_at is null or w.funding_requested_at <= now() - interval '290 seconds') then
   v_start := case when w.funding_more then w.funding_cursor else greatest(0, w.funding_cursor - c_funding_overlap) end;
   v_req := net.http_post(
    url := c_url,
    body := jsonb_build_object('type','userFunding','user',lower(w.address),'startTime',v_start),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 20000);
   insert into public.hl_pending(request_id, user_id, address, kind, start_time) values (v_req, w.user_id, w.address, 'funding', v_start);
   update public.hl_watch set funding_requested_at = now() where user_id = w.user_id;
   v_fired := v_fired + 1;
  end if;
 end loop;
 return jsonb_build_object('ingested', v_ingested, 'fired', v_fired, 'errors', v_errors);
end $$;
revoke all on function public.hl_collect_tick() from public, anon, authenticated;

-- 8. App-facing functions ----------------------------------------------------------
create or replace function public.hl_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := auth.uid(); w record; v_job boolean := null;
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 select * into w from public.hl_watch where user_id = v_user;
 if not found then return jsonb_build_object('address', null); end if;
 begin
  select exists (select 1 from cron.job j where j.jobname = 'hl-collector' and j.active) into v_job;
 exception when others then v_job := null;
 end;
 return jsonb_build_object(
  'address', w.address,
  'last_ok_at', w.last_ok_at,
  'last_error', w.last_error,
  'last_error_at', w.last_error_at,
  'error_count', w.error_count,
  'retry_after', w.retry_after,
  'fills_cursor', w.fills_cursor,
  'funding_cursor', w.funding_cursor,
  'backfilling', w.fills_more or w.funding_more or w.last_ok_at is null,
  'fills_count', (select count(*) from public.hl_fills f where f.address = w.address),
  'funding_count', (select count(*) from public.hl_funding f where f.address = w.address),
  'max_fill_id', (select coalesce(max(f.id),0) from public.hl_fills f where f.address = w.address),
  'max_funding_id', (select coalesce(max(f.id),0) from public.hl_funding f where f.address = w.address),
  'pending', (select count(*) from public.hl_pending q where q.user_id = v_user),
  'cron_active', v_job);
end $$;
revoke all on function public.hl_status() from public, anon;
grant execute on function public.hl_status() to authenticated;

create or replace function public.hl_set_address(addr text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_addr text := lower(btrim(coalesce(addr,'')));
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 if v_addr !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid address' using errcode = '22023'; end if;
 if exists (select 1 from public.hl_watch where user_id = v_user and address <> v_addr) then
  delete from public.hl_pending where user_id = v_user;
 end if;
 insert into public.hl_watch(user_id, address) values (v_user, v_addr)
 on conflict (user_id) do update set
  fills_cursor = case when public.hl_watch.address = excluded.address then public.hl_watch.fills_cursor else 0 end,
  funding_cursor = case when public.hl_watch.address = excluded.address then public.hl_watch.funding_cursor else 0 end,
  fills_more = case when public.hl_watch.address = excluded.address then public.hl_watch.fills_more else false end,
  funding_more = case when public.hl_watch.address = excluded.address then public.hl_watch.funding_more else false end,
  last_ok_at = case when public.hl_watch.address = excluded.address then public.hl_watch.last_ok_at else null end,
  funding_requested_at = case when public.hl_watch.address = excluded.address then public.hl_watch.funding_requested_at else null end,
  address = excluded.address,
  last_error = null, last_error_at = null, error_count = 0, retry_after = null, updated_at = now();
 return public.hl_status();
end $$;
revoke all on function public.hl_set_address(text) from public, anon;
grant execute on function public.hl_set_address(text) to authenticated;

create or replace function public.hl_clear_address()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 delete from public.hl_watch where user_id = v_user; -- pending rows cascade; collected rows stay (hidden).
 return found;
end $$;
revoke all on function public.hl_clear_address() from public, anon;
grant execute on function public.hl_clear_address() to authenticated;

-- 9. Schedule (re-running replaces the job of the same name) -----------------
select cron.schedule('hl-collector', '* * * * *', 'select public.hl_collect_tick()');

-- 10. Optional: Realtime change feed (RLS still applies). Skipped if absent.
do $$
begin
 if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hl_fills') then
   execute 'alter publication supabase_realtime add table public.hl_fills';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hl_funding') then
   execute 'alter publication supabase_realtime add table public.hl_funding';
  end if;
 end if;
end $$;
commit;

-- Check after running (optional):
--   select jobname, schedule, active from cron.job where jobname = 'hl-collector';
--   select * from cron.job_run_details order by start_time desc limit 5;
-- Stop collecting entirely:   select cron.unschedule('hl-collector');
