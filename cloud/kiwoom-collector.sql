-- Trade Journal v10: Kiwoom US-stock cloud collector (server -> Supabase).
-- Run ONCE in Supabase SQL Editor AFTER cloud.sql. Safe to run again (idempotent).
--
-- How it works
--  * A small collector on your own server (AWS Lightsail, fixed IP registered with
--    Kiwoom) reads the Kiwoom read-only APIs (ust21150 orders, ust21070 holdings,
--    ust21640 daily realized PnL) and pushes the day's snapshot here.
--  * The collector never holds a Supabase secret/service_role key. It holds only
--    the publishable (anon) key plus its own collector token "kwc_...".
--    This database stores only sha256(token). The token row is bound to one app
--    user, so a token can only ever write that user's rows.
--  * The app (logged in) creates the token in the browser, registers its hash with
--    kw_register_token(hash), shows the token once, and later READS its own
--    kw_snapshots rows (RLS). Every write goes through kw_push / kw_heartbeat.
--  * Kiwoom App Key / Secret / account number never reach Supabase. Snapshots carry
--    only a 16-hex hash of the account number (same as the PC server).
begin;

-- 1. Collector token, one per app user ---------------------------------------
create table if not exists public.kw_collector (
 user_id uuid primary key references auth.users(id) on delete cascade,
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 account text check (account ~ '^[0-9a-f]{16}$'),
 created_at timestamptz not null default now(),
 last_push_at timestamptz,
 last_seen_at timestamptz,
 last_info jsonb,
 push_count bigint not null default 0,
 window_start timestamptz not null default now(),
 window_count integer not null default 0,
 last_reject text,
 last_reject_at timestamptz
);

-- 2. One snapshot per (user, Kiwoom query date) -------------------------------
create sequence if not exists public.kw_snapshot_seq;
create table if not exists public.kw_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 order_date date not null,
 account text not null check (account ~ '^[0-9a-f]{16}$'),
 as_of bigint not null check (as_of > 0),
 snapshot jsonb not null,
 seq bigint not null default nextval('public.kw_snapshot_seq'),
 updated_at timestamptz not null default now(),
 primary key (user_id, order_date)
);
create index if not exists kw_snapshots_user_seq on public.kw_snapshots(user_id, seq);

-- 3. Privileges and row level security ------------------------------------------
alter table public.kw_collector enable row level security;
alter table public.kw_snapshots enable row level security;
revoke all on public.kw_collector, public.kw_snapshots from public, anon, authenticated;
revoke all on sequence public.kw_snapshot_seq from public, anon, authenticated;
grant select on public.kw_snapshots to authenticated;
drop policy if exists kw_snapshots_own_select on public.kw_snapshots;
create policy kw_snapshots_own_select on public.kw_snapshots for select to authenticated
 using (user_id = (select auth.uid()));
-- kw_collector: no grant, no policy. The app reads it only through kw_status().

-- 4. Internal helpers --------------------------------------------------------------
-- Returns null when the snapshot has the shape produced by KiwoomJournal.query(),
-- otherwise a short reason. The app validates the full content again (KJ.validate).
create or replace function public.kw_check_snapshot(s jsonb)
returns text language plpgsql stable set search_path='' as $$
declare v_date date; v_asof numeric; k text;
begin
 if s is null or jsonb_typeof(s) <> 'object' then return 'snapshot_not_object'; end if;
 for k in select jsonb_object_keys(s) loop
  if k not in ('version','journalVersion','realized','source','account','orderDate','asOf','executionImport','spec','orders','positions','summary','warnings') then
   return 'unknown_key'; end if;
 end loop;
 if s->'journalVersion' is distinct from '1'::jsonb or s->'source' is distinct from '"kiwoom"'::jsonb
    or s->'executionImport' is distinct from 'false'::jsonb then return 'not_kiwoom_journal_v1'; end if;
 if jsonb_typeof(s->'account') is distinct from 'string' or (s->>'account') !~ '^[0-9a-f]{16}$' then return 'bad_account'; end if;
 if jsonb_typeof(s->'orderDate') is distinct from 'string' or (s->>'orderDate') !~ '^\d{4}-\d{2}-\d{2}$' then return 'bad_order_date'; end if;
 begin v_date := (s->>'orderDate')::date; exception when others then return 'bad_order_date'; end;
 if to_char(v_date,'YYYY-MM-DD') <> s->>'orderDate' then return 'bad_order_date'; end if;
 if v_date < current_date - 400 or v_date > current_date + 2 then return 'order_date_out_of_range'; end if;
 if jsonb_typeof(s->'asOf') is distinct from 'number' or (s->>'asOf') !~ '^[0-9]{1,15}$' then return 'bad_as_of'; end if;
 v_asof := (s->>'asOf')::numeric;
 if v_asof > (extract(epoch from now()) * 1000) + 600000 or v_asof < (extract(epoch from now()) * 1000) - 3 * 86400000 then return 'as_of_out_of_range'; end if;
 if jsonb_typeof(s->'realized') is distinct from 'object' or jsonb_typeof(s->'realized'->'rows') is distinct from 'array'
    or s->'realized'->'currency' is distinct from '"USD"'::jsonb or s->'realized'->'apiId' is distinct from '"ust21640"'::jsonb
    or jsonb_typeof(s->'realized'->'reportedTotal') is distinct from 'string' then return 'bad_realized'; end if;
 if jsonb_typeof(s->'orders') is distinct from 'array' or jsonb_typeof(s->'positions') is distinct from 'array' then return 'bad_lists'; end if;
 if jsonb_typeof(s->'summary') is distinct from 'object' or s->'summary'->'currency' is distinct from '"USD"'::jsonb then return 'bad_summary'; end if;
 if s ? 'warnings' and jsonb_typeof(s->'warnings') is distinct from 'array' then return 'bad_warnings'; end if;
 if jsonb_array_length(s->'orders') > 5000 or jsonb_array_length(s->'positions') > 2000 or jsonb_array_length(s->'realized'->'rows') > 2000
    or (s ? 'warnings' and jsonb_array_length(s->'warnings') > 50) then return 'too_many_rows'; end if;
 if exists (select 1 from jsonb_array_elements(s->'orders') e where jsonb_typeof(e) <> 'object' or e->'orderDate' is distinct from s->'orderDate')
  then return 'bad_order_row'; end if;
 if exists (select 1 from jsonb_array_elements(s->'realized'->'rows') e where jsonb_typeof(e) <> 'object' or e->'date' is distinct from s->'orderDate' or e->'currency' is distinct from '"USD"'::jsonb)
  then return 'bad_realized_row'; end if;
 if exists (select 1 from jsonb_array_elements(s->'positions') e where jsonb_typeof(e) <> 'object' or e->'currency' is distinct from '"USD"'::jsonb or jsonb_typeof(e->'symbol') is distinct from 'string')
  then return 'bad_position_row'; end if;
 return null;
end $$;
revoke all on function public.kw_check_snapshot(jsonb) from public, anon, authenticated;

-- Token -> collector row, with a per-token rate limit (60 calls / minute).
-- Raises only for a missing/unknown token (nothing to record against).
create or replace function public.kw_auth(p_token text)
returns public.kw_collector language plpgsql security definer set search_path='' as $$
declare c public.kw_collector;
begin
 if p_token is null or p_token !~ '^kwc_[A-Za-z0-9_-]{43}$' then
  raise exception 'invalid collector token' using errcode = '28000';
 end if;
 select * into c from public.kw_collector
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
 if not found then raise exception 'invalid collector token' using errcode = '28000'; end if;
 if c.window_start < now() - interval '1 minute' then
  update public.kw_collector set window_start = now(), window_count = 1 where user_id = c.user_id returning * into c;
 else
  update public.kw_collector set window_count = window_count + 1 where user_id = c.user_id returning * into c;
 end if;
 return c;
end $$;
revoke all on function public.kw_auth(text) from public, anon, authenticated;

create or replace function public.kw_reject(p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.kw_collector set last_reject = left(p_reason, 120), last_reject_at = now(), last_seen_at = now() where user_id = p_user;
 return jsonb_build_object('ok', false, 'error', left(p_reason, 120));
end $$;
revoke all on function public.kw_reject(uuid, text) from public, anon, authenticated;

-- 5. Collector-facing functions (called with the publishable key + token) --------
create or replace function public.kw_push(p_token text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_reason text; v_rows int; v_seq bigint; v_size int;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return public.kw_reject(c.user_id, 'rate_limited'); end if;
 v_size := octet_length(coalesce(p_snapshot::text, ''));
 if v_size > 1500000 then return public.kw_reject(c.user_id, 'payload_too_large'); end if;
 v_reason := public.kw_check_snapshot(p_snapshot);
 if v_reason is not null then return public.kw_reject(c.user_id, v_reason); end if;
 if c.account is not null and c.account <> p_snapshot->>'account' then
  return public.kw_reject(c.user_id, 'account_mismatch');
 end if;
 if exists (select 1 from public.kw_snapshots s where s.user_id = c.user_id and s.account <> p_snapshot->>'account') then
  return public.kw_reject(c.user_id, 'account_mismatch_existing_rows');
 end if;
 insert into public.kw_snapshots as t (user_id, order_date, account, as_of, snapshot)
 values (c.user_id, (p_snapshot->>'orderDate')::date, p_snapshot->>'account', (p_snapshot->>'asOf')::bigint, p_snapshot)
 on conflict (user_id, order_date) do update set
  account = excluded.account, as_of = excluded.as_of, snapshot = excluded.snapshot,
  seq = nextval('public.kw_snapshot_seq'), updated_at = now()
 where t.as_of < excluded.as_of
 returning t.seq into v_seq;
 get diagnostics v_rows = row_count;
 update public.kw_collector set account = p_snapshot->>'account', last_seen_at = now(),
  last_push_at = case when v_rows > 0 then now() else last_push_at end,
  push_count = push_count + v_rows, last_reject = null, last_reject_at = null
 where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'stored', v_rows > 0, 'seq', v_seq);
end $$;
revoke all on function public.kw_push(text, jsonb) from public;
grant execute on function public.kw_push(text, jsonb) to anon, authenticated;

create or replace function public.kw_heartbeat(p_token text, p_info jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return public.kw_reject(c.user_id, 'rate_limited'); end if;
 if p_info is null or jsonb_typeof(p_info) <> 'object' or octet_length(p_info::text) > 2000 then
  return public.kw_reject(c.user_id, 'bad_heartbeat');
 end if;
 update public.kw_collector set last_seen_at = now(), last_info = p_info where user_id = c.user_id;
 return jsonb_build_object('ok', true);
end $$;
revoke all on function public.kw_heartbeat(text, jsonb) from public;
grant execute on function public.kw_heartbeat(text, jsonb) to anon, authenticated;

-- 6. App-facing functions (logged-in user) ------------------------------------------
create or replace function public.kw_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := auth.uid(); c record; v_latest record;
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 select order_date, as_of into v_latest from public.kw_snapshots where user_id = v_user order by as_of desc limit 1;
 select * into c from public.kw_collector where user_id = v_user;
 if not found then
  return jsonb_build_object('registered', false,
   'snapshot_count', (select count(*) from public.kw_snapshots s where s.user_id = v_user),
   'latest_date', v_latest.order_date, 'latest_as_of', v_latest.as_of);
 end if;
 return jsonb_build_object(
  'registered', true,
  'created_at', c.created_at,
  'last_push_at', c.last_push_at,
  'last_seen_at', c.last_seen_at,
  'last_info', c.last_info,
  'account', c.account,
  'push_count', c.push_count,
  'last_reject', c.last_reject,
  'last_reject_at', c.last_reject_at,
  'snapshot_count', (select count(*) from public.kw_snapshots s where s.user_id = v_user),
  'latest_date', v_latest.order_date,
  'latest_as_of', v_latest.as_of,
  'max_seq', (select coalesce(max(s.seq), 0) from public.kw_snapshots s where s.user_id = v_user));
end $$;
revoke all on function public.kw_status() from public, anon;
grant execute on function public.kw_status() to authenticated;

-- The app sends only sha256(token) as 64 lowercase hex. Registering again replaces
-- (revokes) the previous token immediately.
create or replace function public.kw_register_token(p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_hash text := lower(btrim(coalesce(p_hash, '')));
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token hash' using errcode = '22023'; end if;
 if exists (select 1 from public.kw_collector where token_hash = v_hash and user_id <> v_user) then
  raise exception 'token hash already in use' using errcode = '22023';
 end if;
 insert into public.kw_collector(user_id, token_hash) values (v_user, v_hash)
 on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(),
  account = null, last_push_at = null, last_seen_at = null, last_info = null, push_count = 0,
  window_start = now(), window_count = 0, last_reject = null, last_reject_at = null;
 return public.kw_status();
end $$;
revoke all on function public.kw_register_token(text) from public, anon;
grant execute on function public.kw_register_token(text) to authenticated;

create or replace function public.kw_revoke_token()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 delete from public.kw_collector where user_id = v_user; -- collected snapshots stay
 return found;
end $$;
revoke all on function public.kw_revoke_token() from public, anon;
grant execute on function public.kw_revoke_token() to authenticated;

-- Only needed when you switch to a different Kiwoom account.
create or replace function public.kw_clear_snapshots()
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_n int;
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 delete from public.kw_snapshots where user_id = v_user;
 get diagnostics v_n = row_count;
 update public.kw_collector set account = null where user_id = v_user;
 return v_n;
end $$;
revoke all on function public.kw_clear_snapshots() from public, anon;
grant execute on function public.kw_clear_snapshots() to authenticated;
commit;

-- Check after running (optional, in SQL Editor):
--   select user_id, created_at, last_push_at, last_seen_at, account, last_reject from public.kw_collector;
--   select user_id, order_date, as_of, updated_at from public.kw_snapshots order by updated_at desc limit 5;
