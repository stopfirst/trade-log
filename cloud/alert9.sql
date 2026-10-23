-- Trade Journal alert9: 텔레그램 즉시 복기 (trade-alert 2.6.0 · 앱 v37).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql (alert2/3/5.sql as before).
-- Safe to run again (create ... if not exists / create or replace / drop policy if exists only; no data is dropped).
--
-- What it stores
--  * quick_reviews : one row per closed position the alert server asked about on Telegram and the user answered
--                    ([규칙 준수] or [규칙 위반] + 위반 항목). [나중에] is not stored.
--                    ref = 'hl:<close fill tid>' — the Hyperliquid fill that brought the position to 0 (or flipped it).
--                    The app (v37) finds the journal trade whose exit fills contain that tid (fill.fillId), copies the
--                    answer into the trade (process + violations) only when the trade is still '미평가', and marks the row applied.
--  * Writes come only from the alert server through quick_review_push(token, payload) with the collector token
--    "kwc_..." (same kw_auth check and shared 60 calls/minute limit as kw_push / risk_push). Publishable key only —
--    no service_role key is needed anywhere.
--  * The logged-in app user can SELECT their own rows and UPDATE only applied_at / applied_result of their own rows (RLS).
-- Nothing here places, changes or cancels any broker order.
-- Undo: drop function public.quick_review_push(text, jsonb); drop table public.quick_reviews;  (trade-alert 2.6.0 then
--       stops asking on Telegram after one log line; alerts keep working.)
begin;

create table if not exists public.quick_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 ref text not null check (ref ~ '^(hl|us):[A-Za-z0-9:._-]{1,120}$'),
 market text not null check (market in ('us','hl')),
 symbol text not null check (length(symbol) between 1 and 64),
 direction text not null check (direction in ('long','short')),
 close_key text not null check (length(close_key) between 1 and 120),
 close_at timestamptz not null,
 pnl numeric check (pnl is null or abs(pnl) < 1000000000000),
 r numeric check (r is null or abs(r) < 1000000),
 decision text not null check (decision in ('compliant','violation')),
 violations text[] not null default '{}'::text[] check (cardinality(violations) <= 10),
 answered_at timestamptz not null default now(),
 applied_at timestamptz,
 applied_result text check (applied_result is null or applied_result in ('applied','kept','no_trade')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, ref)
);
create index if not exists quick_reviews_user_answered on public.quick_reviews(user_id, answered_at desc);

alter table public.quick_reviews enable row level security;
revoke all on public.quick_reviews from public, anon, authenticated;
grant select on public.quick_reviews to authenticated;
grant update (applied_at, applied_result) on public.quick_reviews to authenticated;
drop policy if exists quick_reviews_own_select on public.quick_reviews;
create policy quick_reviews_own_select on public.quick_reviews for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists quick_reviews_own_apply on public.quick_reviews;
create policy quick_reviews_own_apply on public.quick_reviews for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Alert server → store Telegram answers (publishable key + collector token). Only the token owner's rows.
-- p_payload = {"items":[{ref, market, symbol, direction, close_key, close_at(ms), pnl, r, decision, violations[]}]}
-- An empty items list is a harmless probe (the server uses it to see whether this file is installed).
-- Re-sending the same ref with a different answer replaces it and clears applied_at (the app re-checks it; it still
-- never overwrites a review the user already wrote in the app).
create or replace function public.quick_review_push(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; x jsonb; v_viol text[]; n int := 0;
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 100000
    or jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb)) > 50 then
  return jsonb_build_object('ok', false, 'error', 'bad_payload'); end if;
 for x in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
  if jsonb_typeof(x) <> 'object'
     or coalesce(x->>'ref','') !~ '^(hl|us):[A-Za-z0-9:._-]{1,120}$'
     or x->>'market' not in ('us','hl') or split_part(x->>'ref', ':', 1) <> x->>'market'
     or coalesce(x->>'symbol','') !~ '^[A-Za-z0-9_:./-]{1,64}$'
     or x->>'direction' not in ('long','short')
     or coalesce(x->>'close_key','') !~ '^[A-Za-z0-9:._-]{1,120}$'
     or coalesce(x->>'close_at','') !~ '^[0-9]{10,16}$'
     or x->>'decision' not in ('compliant','violation')
     or (x->'pnl' is not null and jsonb_typeof(x->'pnl') not in ('number','null'))
     or (x->'r' is not null and jsonb_typeof(x->'r') not in ('number','null'))
     or (x->'violations' is not null and jsonb_typeof(x->'violations') <> 'array') then
   return jsonb_build_object('ok', false, 'error', 'bad_item'); end if;
  select coalesce(array_agg(v order by o), '{}'::text[]) into v_viol
   from jsonb_array_elements_text(coalesce(x->'violations','[]'::jsonb)) with ordinality as t(v, o);
  if cardinality(v_viol) > 10 or exists (select 1 from unnest(v_viol) v where length(v) not between 1 and 40) then
   return jsonb_build_object('ok', false, 'error', 'bad_violations'); end if;
  if x->>'decision' = 'compliant' then v_viol := '{}'::text[]; end if;
  insert into public.quick_reviews as q (user_id, ref, market, symbol, direction, close_key, close_at, pnl, r, decision, violations, answered_at, updated_at)
  values (c.user_id, x->>'ref', x->>'market', x->>'symbol', x->>'direction', x->>'close_key',
   to_timestamp((x->>'close_at')::bigint / 1000.0),
   case when jsonb_typeof(x->'pnl') = 'number' and abs((x->>'pnl')::numeric) < 1000000000000 then (x->>'pnl')::numeric end,
   case when jsonb_typeof(x->'r') = 'number' and abs((x->>'r')::numeric) < 1000000 then (x->>'r')::numeric end,
   x->>'decision', v_viol, now(), now())
  on conflict (user_id, ref) do update set
   decision = excluded.decision, violations = excluded.violations, pnl = excluded.pnl, r = excluded.r,
   answered_at = now(), updated_at = now(),
   applied_at = case when q.decision is distinct from excluded.decision or q.violations is distinct from excluded.violations then null else q.applied_at end,
   applied_result = case when q.decision is distinct from excluded.decision or q.violations is distinct from excluded.violations then null else q.applied_result end;
  n := n + 1;
 end loop;
 update public.kw_collector set last_seen_at = now() where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'version', 9, 'stored', n);
end $$;
revoke all on function public.quick_review_push(text, jsonb) from public;
grant execute on function public.quick_review_push(text, jsonb) to anon, authenticated;

commit;
