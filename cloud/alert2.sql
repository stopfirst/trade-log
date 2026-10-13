-- Trade Journal alert2: 손실한도 판정 v1.2 (trade-alert 2.0.0) 저장소.
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql
-- (hl-collector.sql and balance-snapshot.sql are optional but recommended).
-- Safe to run again (create ... if not exists / create or replace only; nothing is dropped).
--
-- What it stores (one set per app user, market 'us' = 키움 미국주식, 'hl' = 하이퍼리퀴드)
--  * risk_state  : the alert server's current judgment per market. status = what the app shows
--                  (거래 중단 중 ~ 언제까지, 오늘/주/달 손익 %, 재시작 첫날 위험 절반). engine = server memory.
--  * risk_days   : one row per trading day (start/end equity, cash flows, pnl %, trades) → 연속 손실 판정.
--  * risk_events : stops, rule violations (new entry during a stop), restart days. ref is unique per user.
--  * risk_flows  : deposits / withdrawals / transfers netted out of the loss basis (HL ledger, US implied, manual).
--  * App users can only SELECT their own rows (RLS). Every write goes through risk_push() with the
--    collector token "kwc_..." (same auth and shared 60 calls/minute limit as kw_push / alert_status).
--  * risk_status(token) returns what the alert server needs in one call: latest Kiwoom snapshot
--    (holdings + USD cash), recent Kiwoom orders, US close balances (acct_snapshots), the HL address,
--    the app's default risk % (only when the journal revision changed) and the saved risk rows.
-- Nothing here places, changes or cancels any broker order.
begin;

create table if not exists public.risk_state (
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null check (market in ('us','hl')),
 status jsonb not null default '{}'::jsonb check (jsonb_typeof(status) = 'object'),
 engine jsonb not null default '{}'::jsonb check (jsonb_typeof(engine) = 'object'),
 updated_at timestamptz not null default now(),
 primary key (user_id, market)
);
create table if not exists public.risk_days (
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null check (market in ('us','hl')),
 day date not null,
 rec jsonb not null check (jsonb_typeof(rec) = 'object'),
 updated_at timestamptz not null default now(),
 primary key (user_id, market, day)
);
create table if not exists public.risk_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null check (market in ('us','hl')),
 ref text not null check (length(ref) between 3 and 160),
 kind text not null check (kind in ('stop','violation','restart','clear')),
 rule text,
 at timestamptz not null,
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
 created_at timestamptz not null default now(),
 primary key (user_id, ref)
);
create index if not exists risk_events_user_at on public.risk_events(user_id, at desc);
create table if not exists public.risk_flows (
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null check (market in ('us','hl')),
 ref text not null check (length(ref) between 3 and 160),
 at timestamptz not null,
 amount numeric not null check (abs(amount) < 1000000000000),
 kind text not null check (length(kind) between 1 and 40),
 source text not null check (source in ('hl-ledger','us-implied','manual')),
 note text check (note is null or length(note) <= 200),
 created_at timestamptz not null default now(),
 primary key (user_id, ref)
);
create index if not exists risk_flows_user_at on public.risk_flows(user_id, market, at desc);

alter table public.risk_state enable row level security;
alter table public.risk_days enable row level security;
alter table public.risk_events enable row level security;
alter table public.risk_flows enable row level security;
revoke all on public.risk_state, public.risk_days, public.risk_events, public.risk_flows from public, anon, authenticated;
grant select on public.risk_state, public.risk_days, public.risk_events, public.risk_flows to authenticated;
drop policy if exists risk_state_own on public.risk_state;
create policy risk_state_own on public.risk_state for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists risk_days_own on public.risk_days;
create policy risk_days_own on public.risk_days for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists risk_events_own on public.risk_events;
create policy risk_events_own on public.risk_events for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists risk_flows_own on public.risk_flows;
create policy risk_flows_own on public.risk_flows for select to authenticated using (user_id = (select auth.uid()));

-- Read everything the alert server needs (publishable key + collector token).
create or replace function public.risk_status(p_token text, p_us_revision bigint default null, p_hl_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_latest record; v_kst date := (now() at time zone 'Asia/Seoul')::date;
 v_acct jsonb := '[]'::jsonb; v_hl text := null; v_j jsonb := '{}'::jsonb; r record; v_rev bigint; v_known bigint;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 select order_date, as_of, snapshot into v_latest from public.kw_snapshots where user_id = c.user_id order by as_of desc limit 1;
 if to_regclass('public.acct_snapshots') is not null then
  execute $q$ select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day,'YYYY-MM-DD'), 'value', value, 'source', source,
     'etDate', detail->>'etDate', 'captured_at', (extract(epoch from captured_at)*1000)::bigint) order by day), '[]'::jsonb)
   from public.acct_snapshots where user_id = $1 and market = 'us' and day >= $2 $q$ into v_acct using c.user_id, v_kst - 75;
 end if;
 if to_regclass('public.hl_watch') is not null then
  execute 'select address from public.hl_watch where user_id = $1' into v_hl using c.user_id;
 end if;
 for r in select scope, revision from public.journal_cloud where user_id = c.user_id and scope in ('US','HL') loop
  v_known := case when r.scope = 'US' then p_us_revision else p_hl_revision end;
  if v_known is not null and v_known = r.revision then
   v_j := v_j || jsonb_build_object(r.scope, jsonb_build_object('revision', r.revision, 'unchanged', true));
  else
   v_j := v_j || jsonb_build_object(r.scope, (select jsonb_build_object('revision', j.revision, 'unchanged', false,
     'defaultRisk', j.payload->'settings'->'defaultRisk', 'account', j.payload->'settings'->'account')
     from public.journal_cloud j where j.user_id = c.user_id and j.scope = r.scope));
  end if;
 end loop;
 return jsonb_build_object('ok', true, 'version', 2, 'now', (extract(epoch from now()) * 1000)::bigint,
  'kw', jsonb_build_object('account', c.account, 'last_push_at', c.last_push_at,
   'latest', case when v_latest.as_of is null then null else jsonb_build_object(
     'date', to_char(v_latest.order_date, 'YYYY-MM-DD'), 'as_of', v_latest.as_of, 'summary', v_latest.snapshot->'summary',
     'positions', coalesce((select jsonb_agg(jsonb_build_object('symbol', p->'symbol', 'quantity', p->'quantity', 'reportedPnl', p->'reportedPnl', 'reportedValue', p->'reportedValue'))
        from jsonb_array_elements(case when jsonb_typeof(v_latest.snapshot->'positions')='array' then v_latest.snapshot->'positions' else '[]'::jsonb end) p), '[]'::jsonb)) end,
   'orders', coalesce((select jsonb_agg(jsonb_build_object('orderDate', to_char(s.order_date,'YYYY-MM-DD'), 'asOf', s.as_of,
       'key', o->'key', 'orderId', o->'orderId', 'symbol', o->'symbol', 'side', o->'side', 'qty', o->'reportedQuantity',
       'price', o->'reportedPrice', 'status', o->'status', 'time', o->'reportedTime') order by s.order_date, o->>'reportedTime')
     from public.kw_snapshots s, jsonb_array_elements(case when jsonb_typeof(s.snapshot->'orders')='array' then s.snapshot->'orders' else '[]'::jsonb end) o
     where s.user_id = c.user_id and s.order_date >= v_kst - 6 and jsonb_typeof(o) = 'object'), '[]'::jsonb)),
  'acct_us', v_acct,
  'hl_address', v_hl,
  'journal', v_j,
  'risk', jsonb_build_object(
   'state', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'engine', engine, 'updated_at', (extract(epoch from updated_at)*1000)::bigint))
     from public.risk_state where user_id = c.user_id), '[]'::jsonb),
   'events', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'ref', ref, 'kind', kind))
     from public.risk_events where user_id = c.user_id and at > now() - interval '80 days'), '[]'::jsonb),
   'flows', coalesce((select jsonb_agg(jsonb_build_object('market', market, 'ref', ref, 'at', (extract(epoch from at)*1000)::bigint,
       'amount', amount, 'kind', kind, 'source', source, 'note', note) order by at)
     from public.risk_flows where user_id = c.user_id and at > now() - interval '80 days'), '[]'::jsonb)));
end $$;
revoke all on function public.risk_status(text, bigint, bigint) from public;
grant execute on function public.risk_status(text, bigint, bigint) to anon, authenticated;

-- Write the server's judgment (publishable key + collector token). Only the token owner's rows.
create or replace function public.risk_push(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; x jsonb; n_s int := 0; n_d int := 0; n_e int := 0; n_f int := 0; n_x int := 0; v_rows int;
 c_ref constant text := '^[A-Za-z0-9:._@+-]{3,160}$';
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 600000 then
  return jsonb_build_object('ok', false, 'error', 'bad_payload'); end if;
 for x in select * from jsonb_array_elements(case when jsonb_typeof(p_payload->'states')='array' then p_payload->'states' else '[]'::jsonb end) loop
  if x->>'market' not in ('us','hl') or jsonb_typeof(x->'status') <> 'object' or jsonb_typeof(x->'engine') <> 'object' then
   return jsonb_build_object('ok', false, 'error', 'bad_state'); end if;
  insert into public.risk_state as t (user_id, market, status, engine, updated_at) values (c.user_id, x->>'market', x->'status', x->'engine', now())
  on conflict (user_id, market) do update set status = excluded.status, engine = excluded.engine, updated_at = now();
  n_s := n_s + 1;
 end loop;
 for x in select * from jsonb_array_elements(case when jsonb_typeof(p_payload->'days')='array' then p_payload->'days' else '[]'::jsonb end) loop
  if x->>'market' not in ('us','hl') or coalesce(x->>'day','') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(x->'rec') <> 'object' then
   return jsonb_build_object('ok', false, 'error', 'bad_day'); end if;
  insert into public.risk_days as t (user_id, market, day, rec, updated_at) values (c.user_id, x->>'market', (x->>'day')::date, x->'rec', now())
  on conflict (user_id, market, day) do update set rec = excluded.rec, updated_at = now();
  n_d := n_d + 1;
 end loop;
 for x in select * from jsonb_array_elements(case when jsonb_typeof(p_payload->'events')='array' then p_payload->'events' else '[]'::jsonb end) loop
  if x->>'market' not in ('us','hl') or coalesce(x->>'ref','') !~ c_ref or x->>'kind' not in ('stop','violation','restart','clear')
     or jsonb_typeof(x->'at') <> 'number' or jsonb_typeof(coalesce(x->'detail','{}'::jsonb)) <> 'object' then
   return jsonb_build_object('ok', false, 'error', 'bad_event'); end if;
  insert into public.risk_events (user_id, market, ref, kind, rule, at, detail)
  values (c.user_id, x->>'market', x->>'ref', x->>'kind', left(x->>'rule', 40), to_timestamp((x->>'at')::numeric / 1000.0), coalesce(x->'detail','{}'::jsonb))
  on conflict (user_id, ref) do nothing;
  get diagnostics v_rows = row_count; n_e := n_e + v_rows;
 end loop;
 for x in select * from jsonb_array_elements(case when jsonb_typeof(p_payload->'flows')='array' then p_payload->'flows' else '[]'::jsonb end) loop
  if x->>'market' not in ('us','hl') or coalesce(x->>'ref','') !~ c_ref or jsonb_typeof(x->'at') <> 'number' or jsonb_typeof(x->'amount') <> 'number'
     or x->>'source' not in ('hl-ledger','us-implied','manual') then
   return jsonb_build_object('ok', false, 'error', 'bad_flow'); end if;
  insert into public.risk_flows (user_id, market, ref, at, amount, kind, source, note)
  values (c.user_id, x->>'market', x->>'ref', to_timestamp((x->>'at')::numeric / 1000.0), (x->>'amount')::numeric, left(coalesce(x->>'kind','flow'), 40), x->>'source', left(x->>'note', 200))
  on conflict (user_id, ref) do nothing;
  get diagnostics v_rows = row_count; n_f := n_f + v_rows;
 end loop;
 -- Manual flows can be removed again (risk_flows source 'manual' only).
 for x in select * from jsonb_array_elements(case when jsonb_typeof(p_payload->'flow_deletes')='array' then p_payload->'flow_deletes' else '[]'::jsonb end) loop
  delete from public.risk_flows where user_id = c.user_id and ref = x #>> '{}' and source = 'manual';
  get diagnostics v_rows = row_count; n_x := n_x + v_rows;
 end loop;
 update public.kw_collector set last_seen_at = now() where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'states', n_s, 'days', n_d, 'events', n_e, 'flows', n_f, 'flow_deletes', n_x);
end $$;
revoke all on function public.risk_push(text, jsonb) from public;
grant execute on function public.risk_push(text, jsonb) to anon, authenticated;
commit;

-- Check after running (optional):
--   select market, status->>'today' today, status->'stops' stops, updated_at from public.risk_state;
--   select market, ref, kind, at from public.risk_events order by at desc limit 20;
