-- Trade Journal alert20: HL 하위계정 '탄창' 체결·펀딩 수집 (trade-alert 2.16.0 · 앱 v123-subacct와 같은 탄창 목록).
-- Run in Supabase SQL Editor AFTER cloud.sql, kiwoom-collector.sql and hl-collector.sql. Safe to run again
-- (create ... if not exists / create or replace / cron.schedule replaces the job of the same name).
-- alert17.sql / alert18.sql are NOT required (independent).
--
-- What it adds (the existing main-account collector hl_collect_tick / hl_watch / its cron job are NOT touched):
--  * hl_sub_watch   : one row per (user, 탄창 address) with its own cursors / backoff. Rows are kept when a 탄창 is
--                     deselected (active = false) so re-selecting resumes from the cursor.
--  * hl_sub_env     : the 탄창 list the alert server sends from its .env HL_SUBS (fallback only).
--  * hl_sub_tick()  : pg_cron 'hl-sub-collector' every minute. First refreshes each user's 탄창 list:
--                       app settings (journal_cloud 'HL' payload.settings.v123Subs, comma string) if non-empty,
--                       otherwise hl_sub_env (server .env HL_SUBS);
--                       minus settings.v123Ex (default: Scalping 0x2b4f…eea9), minus the main hl_watch address,
--                       always minus Scalping 0x2b4f2042354fadf45922a6e7593b79adf0beeea9; at most 5.
--                     Then the same requests as hl_collect_tick (userFillsByTime 5-min overlap, userFunding every ~5 min,
--                     paging, backoff) for every active 탄창, written into the SAME hl_fills / hl_funding tables with
--                     address = the 탄창 address. unique(address, tid) / unique(address, time, coin) → no duplicates;
--                     main-account rows are unchanged (different address). The app reads hl_fills with address=eq.<main>,
--                     so 탄창 rows never mix into the app's main-account stream.
--  * RLS: app users may also READ hl_fills / hl_funding rows of their own 탄창 addresses (extra policies; old ones stay).
--  * mag_status(token, env, from) : for the alert server (publishable key + collector token, like risk_status):
--                     app 탄창 settings, stored .env list (and stores a new one when p_env is given), collector state,
--                     and (when p_from is given) 탄창 fills/funding since p_from (5000 each).
--
-- ORDER with security/harden-2026-11.sql: harden revokes anon EXECUTE from public functions not on its allow-list.
-- If you run harden AFTER this file, run this file once more (it re-grants execute on mag_status to anon).
--
-- Undo (stop collecting 탄창; collected rows stay but nothing reads them):
--   select cron.unschedule('hl-sub-collector');
--   drop function if exists public.mag_status(text, text, bigint);
--   drop table if exists public.hl_sub_pending, public.hl_sub_watch, public.hl_sub_env;
--   drop policy if exists hl_fills_sub_select on public.hl_fills; drop policy if exists hl_funding_sub_select on public.hl_funding;
-- Requires pg_cron and pg_net (already enabled by hl-collector.sql).
begin;

create extension if not exists pg_cron; -- @extension
create extension if not exists pg_net with schema extensions; -- @extension

-- 1. Tables ------------------------------------------------------------------------
create table if not exists public.hl_sub_watch (
 user_id uuid not null references public.hl_watch(user_id) on delete cascade,
 address text not null check (address ~ '^0x[0-9a-f]{40}$'),
 source text not null default 'app' check (source in ('app','env')),
 active boolean not null default true,
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
 updated_at timestamptz not null default now(),
 primary key (user_id, address)
);
create index if not exists hl_sub_watch_address on public.hl_sub_watch(address);

create table if not exists public.hl_sub_env (
 user_id uuid primary key references auth.users(id) on delete cascade,
 addrs text not null default '' check (length(addrs) <= 1000),
 updated_at timestamptz not null default now()
);

create table if not exists public.hl_sub_pending (
 request_id bigint primary key,
 user_id uuid not null,
 address text not null,
 kind text not null check (kind in ('fills','funding')),
 start_time bigint not null,
 created_at timestamptz not null default now(),
 foreign key (user_id, address) references public.hl_sub_watch(user_id, address) on delete cascade
);
create index if not exists hl_sub_pending_user on public.hl_sub_pending(user_id, address, kind);

-- 2. Privileges and RLS -------------------------------------------------------------
alter table public.hl_sub_watch enable row level security;
alter table public.hl_sub_env enable row level security;
alter table public.hl_sub_pending enable row level security;
revoke all on public.hl_sub_watch, public.hl_sub_env, public.hl_sub_pending from public, anon, authenticated;
grant select on public.hl_sub_watch to authenticated;
drop policy if exists hl_sub_watch_own_select on public.hl_sub_watch;
create policy hl_sub_watch_own_select on public.hl_sub_watch for select to authenticated
 using (user_id = (select auth.uid()));
-- extra read policies (OR-ed with the existing *_own_select ones, which stay as they are)
drop policy if exists hl_fills_sub_select on public.hl_fills;
create policy hl_fills_sub_select on public.hl_fills for select to authenticated
 using (address in (select s.address from public.hl_sub_watch s where s.user_id = (select auth.uid())));
drop policy if exists hl_funding_sub_select on public.hl_funding;
create policy hl_funding_sub_select on public.hl_funding for select to authenticated
 using (address in (select s.address from public.hl_sub_watch s where s.user_id = (select auth.uid())));
-- hl_sub_env / hl_sub_pending: no policy, no grant. Internal only.

-- 3. Helpers --------------------------------------------------------------------------
-- '0xA…, 0xb…  0xc…' → lower-case valid addresses, first-seen order, no duplicates (app v123Split)
create or replace function public.hl_sub_split(p text)
returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(a order by i), '{}'::text[]) from (
  select a, min(i) i from (
   select lower(x) a, i from unnest(regexp_split_to_array(btrim(coalesce(p,'')), '[\s,]+')) with ordinality as u(x, i)
  ) s where a ~ '^0x[0-9a-f]{40}$' group by a) d
$$;
revoke all on function public.hl_sub_split(text) from public, anon, authenticated;

create or replace function public.hl_sub_note_error(p_user uuid, p_addr text, p_kind text, p_message text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.hl_sub_watch set
  error_count = error_count + 1,
  last_error = left(p_kind || ': ' || coalesce(p_message,'unknown error'), 300),
  last_error_at = now(),
  retry_after = now() + make_interval(mins => least(30, power(2, least(error_count, 5))::int)),
  funding_requested_at = case when p_kind = 'funding' then null else funding_requested_at end,
  updated_at = now()
 where user_id = p_user and address = p_addr;
end $$;
revoke all on function public.hl_sub_note_error(uuid,text,text,text) from public, anon, authenticated;

create or replace function public.hl_sub_note_ok(p_user uuid, p_addr text, p_kind text)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.hl_sub_watch set
  last_ok_at = now(),
  error_count = case when last_error is null or last_error like p_kind || ':%' then 0 else error_count end,
  retry_after = case when last_error is null or last_error like p_kind || ':%' then null else retry_after end,
  last_error = case when last_error like p_kind || ':%' then null else last_error end,
  updated_at = now()
 where user_id = p_user and address = p_addr;
end $$;
revoke all on function public.hl_sub_note_ok(uuid,text,text) from public, anon, authenticated;

-- 탄창 list per user: app settings first, .env list second (see header). Returns {address: source} as jsonb.
create or replace function public.hl_sub_wanted(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 c_scalp constant text := '0x2b4f2042354fadf45922a6e7593b79adf0beeea9';
 v_main text; s jsonb := null; v_app text[]; v_env text[]; v_ex text[]; v_src text; v_list text[]; v_out jsonb := '{}'::jsonb; a text; n int := 0;
begin
 select lower(address) into v_main from public.hl_watch where user_id = p_user;
 if v_main is null then return v_out; end if;
 if to_regclass('public.journal_cloud') is not null then
  execute 'select payload->''settings'' from public.journal_cloud where user_id = $1 and scope = ''HL''' into s using p_user;
 end if;
 v_app := case when jsonb_typeof(s->'v123Subs') = 'string' then public.hl_sub_split(s->>'v123Subs') else '{}'::text[] end;
 v_ex := case when jsonb_typeof(s->'v123Ex') = 'string' then public.hl_sub_split(s->>'v123Ex') else array[c_scalp] end;
 select public.hl_sub_split(e.addrs) into v_env from public.hl_sub_env e where e.user_id = p_user;
 v_app := array(select x from unnest(v_app) with ordinality u(x, i) where x <> v_main and x <> c_scalp and not (x = any(v_ex)) order by i);
 v_env := array(select x from unnest(coalesce(v_env, '{}'::text[])) with ordinality u(x, i) where x <> v_main and x <> c_scalp and not (x = any(v_ex)) order by i);
 if cardinality(v_app) > 0 then v_list := v_app; v_src := 'app'; else v_list := v_env; v_src := 'env'; end if;
 foreach a in array v_list loop
  exit when n >= 5;
  v_out := v_out || jsonb_build_object(a, v_src); n := n + 1;
 end loop;
 return v_out;
end $$;
revoke all on function public.hl_sub_wanted(uuid) from public, anon, authenticated;

create or replace function public.hl_sub_refresh()
returns int language plpgsql security definer set search_path='' as $$
declare u record; v_want jsonb; k text; v_changed int := 0; v_n int;
begin
 for u in select user_id from public.hl_watch loop
  v_want := public.hl_sub_wanted(u.user_id);
  for k in select jsonb_object_keys(v_want) loop
   insert into public.hl_sub_watch(user_id, address, source, active) values (u.user_id, k, v_want->>k, true)
   on conflict (user_id, address) do update set active = true, source = excluded.source, updated_at = now()
    where not public.hl_sub_watch.active or public.hl_sub_watch.source <> excluded.source;
   get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  end loop;
  delete from public.hl_sub_pending q using public.hl_sub_watch s
   where q.user_id = s.user_id and q.address = s.address and s.user_id = u.user_id and s.active and not (v_want ? s.address);
  update public.hl_sub_watch set active = false, updated_at = now()
   where user_id = u.user_id and active and not (v_want ? address);
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
 end loop;
 return v_changed;
end $$;
revoke all on function public.hl_sub_refresh() from public, anon, authenticated;

-- 4. The 탄창 collector tick (cron) — same logic as hl_collect_tick, keyed by (user, address) ----------
create or replace function public.hl_sub_tick()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c_url constant text := 'https://api.hyperliquid.xyz/info';
 c_fills_overlap constant bigint := 300000;
 c_funding_overlap constant bigint := 7200000;
 c_fills_cap constant int := 2000;
 c_funding_cap constant int := 500;
 p record; r record; w record;
 v_rows jsonb; v_n int; v_bad int; v_max bigint; v_ins int; v_cap int;
 v_full boolean; v_cursor bigint; v_start bigint; v_req bigint;
 v_ingested int := 0; v_fired int := 0; v_errors int := 0; v_list int := 0;
begin
 if not pg_try_advisory_xact_lock(hashtext('public.hl_sub_tick')) then
  return jsonb_build_object('skipped', true);
 end if;
 v_list := public.hl_sub_refresh();

 -- (a) ingest finished responses
 for p in select * from public.hl_sub_pending order by request_id for update loop
  select resp.status_code, resp.content, resp.timed_out, resp.error_msg into r
   from net._http_response resp where resp.id = p.request_id;
  if not found then
   if p.created_at < now() - interval '10 minutes' then
    delete from public.hl_sub_pending where request_id = p.request_id;
    perform public.hl_sub_note_error(p.user_id, p.address, p.kind, '응답 없음(10분 초과)');
    v_errors := v_errors + 1;
   end if;
   continue;
  end if;
  delete from public.hl_sub_pending where request_id = p.request_id;
  select * into w from public.hl_sub_watch where user_id = p.user_id and address = p.address for update;
  if not found or not w.active then continue; end if;
  if coalesce(r.timed_out, false) or r.error_msg is not null or r.status_code is distinct from 200 then
   perform public.hl_sub_note_error(p.user_id, p.address, p.kind,
    case when coalesce(r.timed_out,false) then '시간 초과'
         when r.error_msg is not null then left(r.error_msg, 150)
         when r.status_code = 429 then 'HTTP 429 요청 한도'
         else 'HTTP ' || coalesce(r.status_code::text,'?') || ' ' || left(coalesce(r.content,''), 120) end);
   v_errors := v_errors + 1;
   continue;
  end if;
  begin v_rows := r.content::jsonb; exception when others then v_rows := null; end;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
   perform public.hl_sub_note_error(p.user_id, p.address, p.kind, '응답 형식 오류');
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
   perform public.hl_sub_note_error(p.user_id, p.address, p.kind, '알 수 없는 행 ' || v_bad || '건 · 반영 보류');
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
   v_cursor := p.start_time + 1;
   update public.hl_sub_watch set last_error = p.kind || ': 같은 시각 ' || v_n || '건 이상 · 일부 누락 가능', last_error_at = now()
    where user_id = p.user_id and address = p.address;
  end if;
  if p.kind = 'fills' then
   update public.hl_sub_watch set fills_cursor = v_cursor, fills_more = v_full, updated_at = now() where user_id = p.user_id and address = p.address;
  else
   update public.hl_sub_watch set funding_cursor = v_cursor, funding_more = v_full, updated_at = now() where user_id = p.user_id and address = p.address;
  end if;
  if not (v_full and coalesce(v_max, p.start_time) <= p.start_time) then
   perform public.hl_sub_note_ok(p.user_id, p.address, p.kind);
  end if;
 end loop;

 -- (b) fire next requests (active 탄창 only)
 for w in select * from public.hl_sub_watch where active and (retry_after is null or retry_after <= now()) for update loop
  if not exists (select 1 from public.hl_sub_pending q where q.user_id = w.user_id and q.address = w.address and q.kind = 'fills') then
   v_start := case when w.fills_more then w.fills_cursor else greatest(0, w.fills_cursor - c_fills_overlap) end;
   v_req := net.http_post(
    url := c_url,
    body := jsonb_build_object('type','userFillsByTime','user',w.address,'startTime',v_start,'aggregateByTime',false),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 20000);
   insert into public.hl_sub_pending(request_id, user_id, address, kind, start_time) values (v_req, w.user_id, w.address, 'fills', v_start);
   update public.hl_sub_watch set fills_requested_at = now() where user_id = w.user_id and address = w.address;
   v_fired := v_fired + 1;
  end if;
  if not exists (select 1 from public.hl_sub_pending q where q.user_id = w.user_id and q.address = w.address and q.kind = 'funding')
     and (w.funding_more or w.funding_cursor = 0 or w.funding_requested_at is null or w.funding_requested_at <= now() - interval '290 seconds') then
   v_start := case when w.funding_more then w.funding_cursor else greatest(0, w.funding_cursor - c_funding_overlap) end;
   v_req := net.http_post(
    url := c_url,
    body := jsonb_build_object('type','userFunding','user',w.address,'startTime',v_start),
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 20000);
   insert into public.hl_sub_pending(request_id, user_id, address, kind, start_time) values (v_req, w.user_id, w.address, 'funding', v_start);
   update public.hl_sub_watch set funding_requested_at = now() where user_id = w.user_id and address = w.address;
   v_fired := v_fired + 1;
  end if;
 end loop;
 return jsonb_build_object('ingested', v_ingested, 'fired', v_fired, 'errors', v_errors, 'list_changes', v_list);
end $$;
revoke all on function public.hl_sub_tick() from public, anon, authenticated;

-- 5. Alert-server function (publishable key + collector token) ------------------------------
-- p_env  : null = leave the stored .env list as is · '' = clear · '0x…,0x…' = store (validated, max 5)
-- p_from : null = no fill rows · ms epoch = 탄창 fills/funding (active rows) with time >= p_from, 5000 each
create or replace function public.mag_status(p_token text, p_env text default null, p_from bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_main text; s jsonb := null; v_env text; v_job boolean := null; v_out jsonb;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_env is not null then
  if length(p_env) > 1000 then return jsonb_build_object('ok', false, 'error', 'bad_env'); end if;
  v_env := array_to_string((public.hl_sub_split(p_env))[1:5], ',');
  insert into public.hl_sub_env(user_id, addrs) values (c.user_id, v_env)
  on conflict (user_id) do update set addrs = excluded.addrs, updated_at = now() where public.hl_sub_env.addrs <> excluded.addrs;
 end if;
 if p_from is not null and (p_from < 0 or p_from > 9999999999999) then return jsonb_build_object('ok', false, 'error', 'bad_from'); end if;
 select lower(address) into v_main from public.hl_watch where user_id = c.user_id;
 if to_regclass('public.journal_cloud') is not null then
  execute 'select payload->''settings'' from public.journal_cloud where user_id = $1 and scope = ''HL''' into s using c.user_id;
 end if;
 begin
  select exists (select 1 from cron.job j where j.jobname = 'hl-sub-collector' and j.active) into v_job;
 exception when others then v_job := null;
 end;
 v_out := jsonb_build_object('ok', true, 'version', 20, 'main', v_main,
  'settings', jsonb_build_object('subs', s->'v123Subs', 'ex', s->'v123Ex', 'pct', s->'v123Pct', 'since', s->'v123Since'),
  'env', (select e.addrs from public.hl_sub_env e where e.user_id = c.user_id),
  'wanted', case when v_main is null then '{}'::jsonb else public.hl_sub_wanted(c.user_id) end,
  'cron_active', v_job,
  'watch', coalesce((select jsonb_agg(jsonb_build_object('address', w.address, 'source', w.source, 'active', w.active,
      'last_ok_at', (extract(epoch from w.last_ok_at)*1000)::bigint, 'last_error', w.last_error, 'error_count', w.error_count,
      'backfilling', w.fills_more or w.funding_more or w.last_ok_at is null,
      'fills_cursor', w.fills_cursor) order by w.created_at)
    from public.hl_sub_watch w where w.user_id = c.user_id), '[]'::jsonb));
 if p_from is not null then
  v_out := v_out || jsonb_build_object(
   'fills', coalesce((select jsonb_agg(jsonb_build_object('address', f.address, 'tid', f.tid, 'time', f.time, 'coin', f.coin, 'raw', f.raw) order by f.time)
     from (select x.address, x.tid, x.time, x.coin, x.raw from public.hl_fills x join public.hl_sub_watch w on w.address = x.address and w.user_id = c.user_id and w.active
           where x.time >= p_from order by x.time limit 5000) f), '[]'::jsonb),
   'funding', coalesce((select jsonb_agg(jsonb_build_object('address', f.address, 'time', f.time, 'coin', f.coin, 'usdc', f.raw->'delta'->>'usdc') order by f.time)
     from (select x.address, x.time, x.coin, x.raw from public.hl_funding x join public.hl_sub_watch w on w.address = x.address and w.user_id = c.user_id and w.active
           where x.time >= p_from order by x.time limit 5000) f), '[]'::jsonb));
 end if;
 return v_out;
end $$;
revoke all on function public.mag_status(text, text, bigint) from public;
grant execute on function public.mag_status(text, text, bigint) to anon, authenticated;

-- 6. Schedule (re-running replaces the job of the same name) ------------------------------
select cron.schedule('hl-sub-collector', '* * * * *', 'select public.hl_sub_tick()');
commit;

-- Check after running (optional):
--   select jobname, schedule, active from cron.job where jobname in ('hl-collector','hl-sub-collector');
--   select address, source, active, last_ok_at, last_error from public.hl_sub_watch;
--   select address, count(*) from public.hl_fills group by address;   -- 주계정 행 수는 그대로
