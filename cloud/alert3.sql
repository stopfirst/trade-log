-- Trade Journal alert3: 손실한도 판정 v1.3 (trade-alert 2.1.0) — 일일 손실 한도 = 앱 v28 기준.
-- Run in Supabase SQL Editor AFTER cloud.sql, kiwoom-collector.sql and alert2.sql
-- (hl-collector.sql and balance-snapshot.sql are optional; without them the matching parts are empty).
-- Safe to run again (create or replace only; no table is created, changed or dropped).
--
-- One read-only function for the alert server: public.risk_day_data(token).
--  * Auth = the collector token "kwc_..." (sha256 hash lookup in kw_collector via kw_auth, same shared
--    60 calls/minute limit as kw_push / risk_status). Called with the publishable key; no service_role.
--  * Returns only the token owner's rows, the same data the app uses for "오늘 실현손익" and the
--    daily loss limit (v27/v28):
--      kw_days : Kiwoom ust21640 daily realized total per Korean query date (kw_snapshots, last 9 days)
--      acct    : daily close balances, both markets (acct_snapshots, last 12 days; HL key = UTC day,
--                US key = detail.etDate)
--      hl      : perp fills (closedPnl, fee) and funding (delta.usdc) since 00:00 UTC yesterday
--                (hl_fills / hl_funding of the address saved in hl_watch)
--  * It writes nothing except the shared rate-limit counter (kw_auth).
-- Nothing here places, changes or cancels any broker order.
begin;

create or replace function public.risk_day_data(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_kst date := (now() at time zone 'Asia/Seoul')::date;
 v_utc date := (now() at time zone 'UTC')::date; v_from_ms bigint;
 v_kw jsonb; v_acct jsonb := '[]'::jsonb; v_addr text := null; v_hl jsonb := null;
 c_num constant text := '^-?[0-9]{1,15}(\.[0-9]{1,18})?$';
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

 v_kw := coalesce((select jsonb_agg(jsonb_build_object('date', to_char(s.order_date, 'YYYY-MM-DD'), 'as_of', s.as_of,
     'total', s.snapshot->'realized'->>'reportedTotal',
     'count', jsonb_array_length(s.snapshot->'realized'->'rows')) order by s.order_date)
   from public.kw_snapshots s
   where s.user_id = c.user_id and s.order_date >= v_kst - 8
     and s.snapshot->'realized'->>'apiId' = 'ust21640' and s.snapshot->'realized'->>'currency' = 'USD'
     and jsonb_typeof(s.snapshot->'realized'->'rows') = 'array'
     and coalesce(s.snapshot->'realized'->>'reportedTotal', '') ~ c_num), '[]'::jsonb);

 if to_regclass('public.acct_snapshots') is not null then
  execute $q$ select coalesce(jsonb_agg(jsonb_build_object('market', market, 'day', to_char(day, 'YYYY-MM-DD'), 'value', value,
     'source', source, 'etDate', detail->>'etDate', 'captured_at', (extract(epoch from captured_at) * 1000)::bigint) order by market, day), '[]'::jsonb)
   from public.acct_snapshots where user_id = $1 and day >= $2 $q$ into v_acct using c.user_id, v_kst - 12;
 end if;

 if to_regclass('public.hl_watch') is not null then
  execute 'select lower(address) from public.hl_watch where user_id = $1' into v_addr using c.user_id;
 end if;
 if v_addr is not null and to_regclass('public.hl_fills') is not null and to_regclass('public.hl_funding') is not null then
  v_from_ms := (extract(epoch from ((v_utc - 1)::timestamp at time zone 'UTC')) * 1000)::bigint;
  execute $q$ select jsonb_build_object('address', $1, 'from', $2,
    'fills', coalesce((select jsonb_agg(jsonb_build_object('tid', f.tid, 'time', f.time, 'coin', f.coin, 'dir', f.raw->>'dir',
        'closedPnl', f.raw->>'closedPnl', 'fee', f.raw->>'fee', 'feeToken', f.raw->>'feeToken') order by f.time, f.tid)
      from (select tid, time, coin, raw from public.hl_fills where address = $1 and time >= $2 order by time limit 5000) f), '[]'::jsonb),
    'funding', coalesce((select jsonb_agg(jsonb_build_object('time', f.time, 'coin', f.coin, 'usdc', f.raw->'delta'->>'usdc') order by f.time, f.coin)
      from (select time, coin, raw from public.hl_funding where address = $1 and time >= $2 order by time limit 5000) f), '[]'::jsonb),
    'last_fill_time', (select max(time) from public.hl_fills where address = $1)) $q$
   into v_hl using v_addr, v_from_ms;
 end if;

 return jsonb_build_object('ok', true, 'version', 3, 'now', (extract(epoch from now()) * 1000)::bigint,
  'kst', to_char(v_kst, 'YYYY-MM-DD'), 'utc', to_char(v_utc, 'YYYY-MM-DD'),
  'kw_days', v_kw, 'acct', v_acct, 'hl', v_hl);
end $$;
revoke all on function public.risk_day_data(text) from public;
grant execute on function public.risk_day_data(text) to anon, authenticated;
commit;

-- Check after running (optional):
--   select proname, prosecdef from pg_proc where proname = 'risk_day_data';   -- 1 row, prosecdef = true
