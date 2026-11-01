-- Trade Journal alert15: 복수매매 차단 알림 기록 (trade-alert 2.11.0).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql (alert2/3/5/9/11/13.sql as before).
-- Safe to run again (create ... if not exists / create or replace / drop policy if exists only; no data is dropped).
--
-- Why a new table (not risk_events): the app (v21~) reads every risk_events row with kind = 'violation' as
-- "거래 중단 중 진입 / 한도 도달 뒤 진입" and tags the matching trade. Revenge-trade warnings are a different rule, and
-- app v99 computes them itself from the journal trades, so the server keeps its own history here instead.
--
-- What it stores
--  * revenge_alerts : one row per Telegram warning the alert server sent
--      ref 'rv:hl:<entry fill tid>' / 'rv:us:<Kiwoom order key>'  (entry warnings: cooldown, switch, streak, risk_up)
--      ref 'rv:stop:<hl|us>:<day>'                                 ('오늘은 여기까지', kinds = {stop_day})
--      entry_key = HL entry fill tid (app trade entries[].fillId) / Kiwoom order key; entry_date = Kiwoom order date (KST).
--      why = the button answer to "손절 후 종목 갈아타기" (US): 'plan' = 미리 정한 가격, 'strong' = 강해 보여서
--            (meant to be copied into the app trade as t.v99Why by an app version that reads this table; applied_* are for that).
--  * Writes come only from the alert server through revenge_push(token, payload) with the collector token "kwc_..."
--    (same kw_auth check and shared 60 calls/minute limit as kw_push / risk_push). Publishable key only.
--  * revenge_data(token, days) is read-only: recent Kiwoom orders, per-symbol daily realized PnL (ust21640) and the latest
--    holdings, so the server can tell a US loss close (손절) exactly the way the app does (pl_amt = after commission and tax).
--  * The logged-in app user can SELECT their own rows and UPDATE only applied_at / applied_result of their own rows (RLS).
-- Nothing here places, changes or cancels any broker order.
-- Undo: drop function public.revenge_push(text, jsonb); drop function public.revenge_data(text, int); drop table public.revenge_alerts;
--       (trade-alert 2.11.0 then keeps sending Telegram warnings, keeps the history only on the server and estimates US PnL.)
begin;

create table if not exists public.revenge_alerts (
 user_id uuid not null references auth.users(id) on delete cascade,
 ref text not null check (ref ~ '^rv:[A-Za-z0-9:._@+-]{3,160}$'),
 market text not null check (market in ('us','hl')),
 kinds text[] not null default '{}'::text[] check (kinds <@ array['cooldown','switch','streak','risk_up','stop_day']::text[]),
 day date,
 symbol text check (symbol is null or length(symbol) between 1 and 64),
 direction text check (direction is null or direction in ('long','short')),
 entry_key text check (entry_key is null or entry_key ~ '^[A-Za-z0-9:._@+-]{1,120}$'),
 entry_date date,
 entry_at timestamptz,
 prev_symbol text check (prev_symbol is null or length(prev_symbol) between 1 and 64),
 prev_key text check (prev_key is null or prev_key ~ '^[A-Za-z0-9:._@+-]{1,120}$'),
 prev_pnl numeric check (prev_pnl is null or abs(prev_pnl) < 1000000000000),
 prev_close_at timestamptz,
 minutes numeric check (minutes is null or (minutes >= 0 and minutes < 10000000)),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 8000),
 why text check (why is null or why in ('plan','strong')),
 why_label text check (why_label is null or length(why_label) <= 40),
 why_at timestamptz,
 sent_at timestamptz,
 applied_at timestamptz,
 applied_result text check (applied_result is null or applied_result in ('applied','kept','no_trade')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, ref)
);
create index if not exists revenge_alerts_user_sent on public.revenge_alerts(user_id, sent_at desc);

alter table public.revenge_alerts enable row level security;
revoke all on public.revenge_alerts from public, anon, authenticated;
grant select on public.revenge_alerts to authenticated;
grant update (applied_at, applied_result) on public.revenge_alerts to authenticated;
drop policy if exists revenge_alerts_own_select on public.revenge_alerts;
create policy revenge_alerts_own_select on public.revenge_alerts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists revenge_alerts_own_apply on public.revenge_alerts;
create policy revenge_alerts_own_apply on public.revenge_alerts for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Alert server → store warnings and button answers. Only the token owner's rows.
-- p_payload = {"items":[{ref, market, kinds[], day, symbol, direction, entry_key, entry_date, entry_at(ms), prev_symbol, prev_key,
--                        prev_pnl, prev_close_at(ms), minutes, detail{}, sent_at(ms)}],
--              "answers":[{ref, market, why('plan'|'strong'), why_label, why_at(ms)}]}
-- Empty lists = harmless probe (the server uses it to see whether this file is installed).
-- Re-sending an item updates it but never touches why; an answer for a row not stored yet creates a minimal row.
create or replace function public.revenge_push(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; x jsonb; v_kinds text[]; n int := 0; a int := 0;
 c_ref constant text := '^rv:[A-Za-z0-9:._@+-]{3,160}$'; c_key constant text := '^[A-Za-z0-9:._@+-]{1,120}$';
 c_ms constant text := '^[0-9]{10,16}$'; c_day constant text := '^\d{4}-\d{2}-\d{2}$';
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 200000
    or jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb)) > 50
    or jsonb_typeof(coalesce(p_payload->'answers','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'answers','[]'::jsonb)) > 50 then
  return jsonb_build_object('ok', false, 'error', 'bad_payload'); end if;
 for x in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
  if jsonb_typeof(x) <> 'object' or coalesce(x->>'ref','') !~ c_ref or x->>'market' not in ('us','hl')
     or jsonb_typeof(coalesce(x->'kinds','[]'::jsonb)) <> 'array'
     or (x->>'day' is not null and x->>'day' !~ c_day)
     or (x->>'symbol' is not null and x->>'symbol' !~ '^[A-Za-z0-9_:./-]{1,64}$')
     or (x->>'prev_symbol' is not null and x->>'prev_symbol' !~ '^[A-Za-z0-9_:./-]{1,64}$')
     or (x->>'direction' is not null and x->>'direction' not in ('long','short'))
     or (x->>'entry_key' is not null and x->>'entry_key' !~ c_key)
     or (x->>'prev_key' is not null and x->>'prev_key' !~ c_key)
     or (x->>'entry_date' is not null and x->>'entry_date' !~ c_day)
     or (x->>'entry_at' is not null and x->>'entry_at' !~ c_ms)
     or (x->>'prev_close_at' is not null and x->>'prev_close_at' !~ c_ms)
     or (x->>'sent_at' is not null and x->>'sent_at' !~ c_ms)
     or (x->'prev_pnl' is not null and jsonb_typeof(x->'prev_pnl') not in ('number','null'))
     or (x->'minutes' is not null and jsonb_typeof(x->'minutes') not in ('number','null'))
     or (x->'detail' is not null and jsonb_typeof(x->'detail') not in ('object','null')) then
   return jsonb_build_object('ok', false, 'error', 'bad_item'); end if;
  select coalesce(array_agg(distinct k), '{}'::text[]) into v_kinds from jsonb_array_elements_text(coalesce(x->'kinds','[]'::jsonb)) k;
  if not (v_kinds <@ array['cooldown','switch','streak','risk_up','stop_day']::text[]) then
   return jsonb_build_object('ok', false, 'error', 'bad_kinds'); end if;
  if octet_length(coalesce(x->'detail','{}'::jsonb)::text) > 8000 then return jsonb_build_object('ok', false, 'error', 'bad_detail'); end if;
  insert into public.revenge_alerts as t (user_id, ref, market, kinds, day, symbol, direction, entry_key, entry_date, entry_at,
    prev_symbol, prev_key, prev_pnl, prev_close_at, minutes, detail, sent_at, updated_at)
  values (c.user_id, x->>'ref', x->>'market', v_kinds, (x->>'day')::date, x->>'symbol', x->>'direction', x->>'entry_key',
   (x->>'entry_date')::date, to_timestamp((x->>'entry_at')::bigint / 1000.0), x->>'prev_symbol', x->>'prev_key',
   case when jsonb_typeof(x->'prev_pnl') = 'number' and abs((x->>'prev_pnl')::numeric) < 1000000000000 then (x->>'prev_pnl')::numeric end,
   to_timestamp((x->>'prev_close_at')::bigint / 1000.0),
   case when jsonb_typeof(x->'minutes') = 'number' and (x->>'minutes')::numeric >= 0 and (x->>'minutes')::numeric < 10000000 then (x->>'minutes')::numeric end,
   coalesce(case when jsonb_typeof(x->'detail') = 'object' then x->'detail' end, '{}'::jsonb),
   coalesce(to_timestamp((x->>'sent_at')::bigint / 1000.0), now()), now())
  on conflict (user_id, ref) do update set
   market = excluded.market, kinds = (select coalesce(array_agg(distinct k), '{}'::text[]) from unnest(t.kinds || excluded.kinds) k),
   day = excluded.day, symbol = excluded.symbol, direction = excluded.direction, entry_key = excluded.entry_key, entry_date = excluded.entry_date,
   entry_at = excluded.entry_at, prev_symbol = excluded.prev_symbol, prev_key = excluded.prev_key, prev_pnl = excluded.prev_pnl,
   prev_close_at = excluded.prev_close_at, minutes = excluded.minutes, detail = excluded.detail,
   sent_at = coalesce(t.sent_at, excluded.sent_at), updated_at = now();
  n := n + 1;
 end loop;
 for x in select * from jsonb_array_elements(coalesce(p_payload->'answers','[]'::jsonb)) loop
  if jsonb_typeof(x) <> 'object' or coalesce(x->>'ref','') !~ c_ref or x->>'market' not in ('us','hl')
     or x->>'why' not in ('plan','strong') or length(coalesce(x->>'why_label','')) > 40
     or (x->>'why_at' is not null and x->>'why_at' !~ c_ms) then
   return jsonb_build_object('ok', false, 'error', 'bad_answer'); end if;
  insert into public.revenge_alerts as t (user_id, ref, market, kinds, why, why_label, why_at, updated_at)
  values (c.user_id, x->>'ref', x->>'market', array['switch']::text[], x->>'why', x->>'why_label',
   coalesce(to_timestamp((x->>'why_at')::bigint / 1000.0), now()), now())
  on conflict (user_id, ref) do update set why = excluded.why, why_label = excluded.why_label, why_at = excluded.why_at, updated_at = now(),
   applied_at = case when t.why is distinct from excluded.why then null else t.applied_at end,
   applied_result = case when t.why is distinct from excluded.why then null else t.applied_result end;
  a := a + 1;
 end loop;
 update public.kw_collector set last_seen_at = now() where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'version', 15, 'stored', n, 'answers', a);
end $$;
revoke all on function public.revenge_push(text, jsonb) from public;
grant execute on function public.revenge_push(text, jsonb) to anon, authenticated;

-- Alert server ← recent Kiwoom orders + per-symbol daily realized PnL + latest holdings (read-only, own rows only).
-- p_days = how many Korean order dates back (1–62, default 8). Orders have the same shape as risk_status().kw.orders.
create or replace function public.revenge_data(p_token text, p_days int default 8)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_kst date := (now() at time zone 'Asia/Seoul')::date; v_days int := least(62, greatest(1, coalesce(p_days, 8)));
 v_orders jsonb; v_real jsonb; v_pos jsonb;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 v_orders := coalesce((select jsonb_agg(jsonb_build_object('orderDate', to_char(s.order_date,'YYYY-MM-DD'), 'asOf', s.as_of,
     'key', o->'key', 'orderId', o->'orderId', 'symbol', o->'symbol', 'side', o->'side', 'qty', o->'reportedQuantity',
     'price', o->'reportedPrice', 'status', o->'status', 'time', o->'reportedTime') order by s.order_date, o->>'reportedTime')
   from public.kw_snapshots s, jsonb_array_elements(case when jsonb_typeof(s.snapshot->'orders')='array' then s.snapshot->'orders' else '[]'::jsonb end) o
   where s.user_id = c.user_id and s.order_date >= v_kst - v_days and jsonb_typeof(o) = 'object'), '[]'::jsonb);
 v_real := coalesce((select jsonb_agg(jsonb_build_object('date', to_char(s.order_date,'YYYY-MM-DD'), 'as_of', s.as_of,
     'symbol', r->'symbol', 'quantity', r->'quantity', 'averageBuyPrice', r->'averageBuyPrice', 'averageSellPrice', r->'averageSellPrice',
     'reportedNet', r->'reportedNet', 'commission', r->'commission', 'tax', r->'tax') order by s.order_date, r->>'symbol')
   from public.kw_snapshots s, jsonb_array_elements(case when jsonb_typeof(s.snapshot->'realized'->'rows')='array' then s.snapshot->'realized'->'rows' else '[]'::jsonb end) r
   where s.user_id = c.user_id and s.order_date >= v_kst - v_days and s.snapshot->'realized'->>'apiId' = 'ust21640'
     and s.snapshot->'realized'->>'currency' = 'USD' and jsonb_typeof(r) = 'object'), '[]'::jsonb);
 v_pos := coalesce((select jsonb_agg(jsonb_build_object('symbol', p->'symbol', 'quantity', p->'quantity', 'averagePrice', p->'averagePrice'))
   from (select snapshot from public.kw_snapshots where user_id = c.user_id order by as_of desc limit 1) l,
     jsonb_array_elements(case when jsonb_typeof(l.snapshot->'positions')='array' then l.snapshot->'positions' else '[]'::jsonb end) p
   where jsonb_typeof(p) = 'object'), '[]'::jsonb);
 return jsonb_build_object('ok', true, 'version', 15, 'days', v_days, 'orders', v_orders, 'realized', v_real, 'positions', v_pos);
end $$;
revoke all on function public.revenge_data(text, int) from public;
grant execute on function public.revenge_data(text, int) to anon, authenticated;

commit;

-- Check after running (optional):
--   select ref, kinds, symbol, prev_symbol, prev_pnl, minutes, why, sent_at from public.revenge_alerts order by sent_at desc limit 20;
