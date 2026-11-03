-- Trade Journal alert17: HL 방향 전환(롱↔숏) 감지 기록 (trade-alert 2.13.0).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql (alert2/3/5/9/11/13/15.sql as before).
-- Safe to run again (create ... if not exists / create or replace / drop policy if exists only; no data is dropped).
--
-- ORDER with security/harden-2026-11.sql: harden revokes anon EXECUTE from every public function that is not on its own allow-list,
-- and flip_push is not on it. So run harden FIRST and this file AFTER it. If harden was (re)run after this file,
-- just run this file once more — it re-grants execute on flip_push to anon (the alert server calls it with the publishable key).
--
-- What it stores
--  * flip_alerts : one row per Telegram '[방향 전환 의심]' warning the alert server sent (Hyperliquid perps, incl. HIP-3 'dex:COIN').
--      ref  = 'fl:hl:<coin>:<oid>'  (one row per order; several fills of one order = one row)
--      kind = 'order'  : one order (oid) took the position across zero (long → short or short → long) = non-reduce-only order larger than the position
--             'window' : the position was closed to 0 and a NEW order opened the opposite side within FLIP_WINDOW_MIN minutes (gap_sec)
--      oid / tid = the order id / first opposite fill id (tid = app trade fillId of the opposite fill; oid = app orderId)
--      close_oid / close_tid / close_at = the closing order (window only)
--      reduce_only = false when known (orderStatus says reduceOnly=false, or kind 'order' implies it); reduce_only_source 'order' | 'fills'
--  * Writes come only from the alert server through flip_push(token, payload) with the collector token "kwc_..."
--    (same kw_auth check and shared 60 calls/minute limit as kw_push / risk_push / revenge_push). Publishable key only.
--  * The logged-in app user can SELECT their own rows and UPDATE only applied_at / applied_result of their own rows (RLS)
--    — for an app version that tags the opposite trade '주문 실수' and marks the row as handled.
-- Nothing here places, changes or cancels any order.
-- Undo: drop function public.flip_push(text, jsonb); drop table public.flip_alerts;
--       (trade-alert 2.13.0 then keeps sending Telegram warnings and keeps the history only on the server.)
begin;

create table if not exists public.flip_alerts (
 user_id uuid not null references auth.users(id) on delete cascade,
 ref text not null check (ref ~ '^fl:hl:[A-Za-z0-9:._@+-]{3,160}$'),
 market text not null default 'hl' check (market in ('hl')),
 kind text not null check (kind in ('order','window')),
 symbol text not null check (symbol ~ '^[A-Za-z0-9_:.-]{1,64}$'),
 dex text check (dex is null or dex ~ '^[A-Za-z0-9_-]{1,32}$'),
 prev_dir text not null check (prev_dir in ('long','short')),
 prev_size numeric check (prev_size is null or (prev_size >= 0 and prev_size < 1e15)),
 new_dir text not null check (new_dir in ('long','short')),
 new_size numeric check (new_size is null or (new_size >= 0 and new_size < 1e15)),
 px numeric check (px is null or (px >= 0 and px < 1e15)),
 at timestamptz not null,
 oid text check (oid is null or oid ~ '^[0-9]{1,24}$'),
 tid text check (tid is null or tid ~ '^[0-9]{1,24}$'),
 close_oid text check (close_oid is null or close_oid ~ '^[0-9]{1,24}$'),
 close_tid text check (close_tid is null or close_tid ~ '^[0-9]{1,24}$'),
 close_at timestamptz,
 gap_sec numeric check (gap_sec is null or (gap_sec >= 0 and gap_sec < 100000)),
 reduce_only boolean,
 reduce_only_source text check (reduce_only_source is null or reduce_only_source in ('order','fills')),
 order_type text check (order_type is null or length(order_type) <= 40),
 tif text check (tif is null or length(tif) <= 40),
 orig_sz numeric check (orig_sz is null or (orig_sz >= 0 and orig_sz < 1e15)),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4000),
 sent_at timestamptz,
 applied_at timestamptz,
 applied_result text check (applied_result is null or applied_result in ('tagged','kept','no_trade')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, ref)
);
create index if not exists flip_alerts_user_at on public.flip_alerts(user_id, at desc);

alter table public.flip_alerts enable row level security;
revoke all on public.flip_alerts from public, anon, authenticated;
grant select on public.flip_alerts to authenticated;
grant update (applied_at, applied_result) on public.flip_alerts to authenticated;
drop policy if exists flip_alerts_own_select on public.flip_alerts;
create policy flip_alerts_own_select on public.flip_alerts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists flip_alerts_own_apply on public.flip_alerts;
create policy flip_alerts_own_apply on public.flip_alerts for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Alert server → store warnings. Only the token owner's rows.
-- p_payload = {"items":[{ref, market:'hl', kind, symbol, dex, prev_dir, prev_size, new_dir, new_size, px, at(ms), oid, tid,
--                        close_oid, close_tid, close_at(ms), gap_sec, reduce_only, reduce_only_source, order_type, tif, orig_sz, detail{}, sent_at(ms)}]}
-- Empty list = harmless probe (the server uses it to see whether this file is installed).
-- Re-sending a ref updates sizes/prices; order info (reduce_only, order_type, tif, orig_sz) is only overwritten by a non-null value;
-- sent_at keeps the first value; applied_* are never touched by the server.
create or replace function public.flip_push(p_token text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; x jsonb; n int := 0;
 c_ref constant text := '^fl:hl:[A-Za-z0-9:._@+-]{3,160}$'; c_id constant text := '^[0-9]{1,24}$'; c_ms constant text := '^[0-9]{10,16}$';
 c_num constant text[] := array['prev_size','new_size','px','gap_sec','orig_sz'];
 k text;
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 200000
    or jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb)) > 50 then
  return jsonb_build_object('ok', false, 'error', 'bad_payload'); end if;
 for x in select * from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
  if jsonb_typeof(x) <> 'object' or coalesce(x->>'ref','') !~ c_ref or coalesce(x->>'market','hl') <> 'hl'
     or coalesce(x->>'kind','') not in ('order','window')
     or coalesce(x->>'symbol','') !~ '^[A-Za-z0-9_:.-]{1,64}$'
     or (x->>'dex' is not null and x->>'dex' !~ '^[A-Za-z0-9_-]{1,32}$')
     or coalesce(x->>'prev_dir','') not in ('long','short') or coalesce(x->>'new_dir','') not in ('long','short')
     or coalesce(x->>'at','') !~ c_ms
     or (x->>'close_at' is not null and x->>'close_at' !~ c_ms)
     or (x->>'sent_at' is not null and x->>'sent_at' !~ c_ms)
     or (x->>'oid' is not null and x->>'oid' !~ c_id) or (x->>'tid' is not null and x->>'tid' !~ c_id)
     or (x->>'close_oid' is not null and x->>'close_oid' !~ c_id) or (x->>'close_tid' is not null and x->>'close_tid' !~ c_id)
     or (x->'reduce_only' is not null and jsonb_typeof(x->'reduce_only') not in ('boolean','null'))
     or (x->>'reduce_only_source' is not null and x->>'reduce_only_source' not in ('order','fills'))
     or length(coalesce(x->>'order_type','')) > 40 or length(coalesce(x->>'tif','')) > 40
     or (x->'detail' is not null and jsonb_typeof(x->'detail') not in ('object','null')) then
   return jsonb_build_object('ok', false, 'error', 'bad_item'); end if;
  foreach k in array c_num loop
   if x->k is not null and jsonb_typeof(x->k) <> 'null'
      and (jsonb_typeof(x->k) <> 'number' or (x->>k)::numeric < 0 or (x->>k)::numeric >= (case when k = 'gap_sec' then 100000 else 1e15 end)) then
    return jsonb_build_object('ok', false, 'error', 'bad_number'); end if;
  end loop;
  if octet_length(coalesce(x->'detail','{}'::jsonb)::text) > 4000 then return jsonb_build_object('ok', false, 'error', 'bad_detail'); end if;
  insert into public.flip_alerts as t (user_id, ref, market, kind, symbol, dex, prev_dir, prev_size, new_dir, new_size, px, at, oid, tid,
    close_oid, close_tid, close_at, gap_sec, reduce_only, reduce_only_source, order_type, tif, orig_sz, detail, sent_at, updated_at)
  values (c.user_id, x->>'ref', 'hl', x->>'kind', x->>'symbol', x->>'dex', x->>'prev_dir', (x->>'prev_size')::numeric, x->>'new_dir',
   (x->>'new_size')::numeric, (x->>'px')::numeric, to_timestamp((x->>'at')::bigint / 1000.0), x->>'oid', x->>'tid',
   x->>'close_oid', x->>'close_tid', to_timestamp((x->>'close_at')::bigint / 1000.0), (x->>'gap_sec')::numeric,
   case when jsonb_typeof(x->'reduce_only') = 'boolean' then (x->>'reduce_only')::boolean end, x->>'reduce_only_source',
   x->>'order_type', x->>'tif', (x->>'orig_sz')::numeric,
   coalesce(case when jsonb_typeof(x->'detail') = 'object' then x->'detail' end, '{}'::jsonb),
   coalesce(to_timestamp((x->>'sent_at')::bigint / 1000.0), now()), now())
  on conflict (user_id, ref) do update set
   kind = excluded.kind, symbol = excluded.symbol, dex = excluded.dex, prev_dir = excluded.prev_dir,
   prev_size = coalesce(excluded.prev_size, t.prev_size), new_dir = excluded.new_dir, new_size = coalesce(excluded.new_size, t.new_size),
   px = coalesce(excluded.px, t.px), at = excluded.at, oid = coalesce(excluded.oid, t.oid), tid = coalesce(excluded.tid, t.tid),
   close_oid = coalesce(excluded.close_oid, t.close_oid), close_tid = coalesce(excluded.close_tid, t.close_tid),
   close_at = coalesce(excluded.close_at, t.close_at), gap_sec = coalesce(excluded.gap_sec, t.gap_sec),
   reduce_only = coalesce(excluded.reduce_only, t.reduce_only), reduce_only_source = coalesce(excluded.reduce_only_source, t.reduce_only_source),
   order_type = coalesce(excluded.order_type, t.order_type), tif = coalesce(excluded.tif, t.tif), orig_sz = coalesce(excluded.orig_sz, t.orig_sz),
   detail = t.detail || excluded.detail, sent_at = coalesce(t.sent_at, excluded.sent_at), updated_at = now();
  n := n + 1;
 end loop;
 update public.kw_collector set last_seen_at = now() where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'version', 17, 'stored', n);
end $$;
revoke all on function public.flip_push(text, jsonb) from public;
grant execute on function public.flip_push(text, jsonb) to anon, authenticated;

commit;

-- Check after running (optional):
--   select ref, kind, symbol, prev_dir, prev_size, new_dir, new_size, at, oid, reduce_only from public.flip_alerts order by at desc limit 20;
--   select has_function_privilege('anon', 'public.flip_push(text, jsonb)', 'execute');   -- must be true (false = run this file again after harden)
