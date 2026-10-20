-- Trade Journal alert5: 손실한도 판정 v1.5 (trade-alert 2.3.0) — 주·월 한도·연속 손실일도 실현손익 기준(앱과 같음).
-- Run in Supabase SQL Editor AFTER cloud.sql, kiwoom-collector.sql, alert2.sql and alert3.sql
-- (hl-collector.sql and balance-snapshot.sql are optional; without them the matching parts are empty).
-- Safe to run again (create or replace only; no table is created, changed or dropped).
--
-- Replaces the read-only function public.risk_day_data(token) from alert3.sql with version 5 (same name,
-- same argument, same auth). Everything version 3 returned is still returned with the same shape, plus:
--  * kw_days : Kiwoom ust21640 daily realized totals for the last 45 Korean dates (was 9) → week/month sums
--  * acct    : daily close balances for the last 40 days (was 12) → loss-streak day denominators
--  * hl.days : per-UTC-day totals of perp fills (count, sum(closedPnl - fee), fees) and funding (count, sum)
--              from the earliest of {this UTC month, this UTC week (Monday), 14 days ago} minus one day.
--              Same fill filter as the alert server / app (coin not '@…' or '…/…', perp dir, feeToken USDC).
--  * period_from : the first UTC date covered by hl.days
--  Auth = the collector token "kwc_..." (sha256 hash lookup in kw_collector via kw_auth, same shared
--  60 calls/minute limit as kw_push / risk_status). Called with the publishable key; no service_role.
--  Only the token owner's rows. It writes nothing except the shared rate-limit counter (kw_auth).
-- Nothing here places, changes or cancels any broker order.
-- Undo: run alert3.sql again (restores version 3; trade-alert 2.3.0 then judges week/month like v1.4).
begin;

create or replace function public.risk_day_data(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_kst date := (now() at time zone 'Asia/Seoul')::date;
 v_utc date := (now() at time zone 'UTC')::date; v_from_ms bigint; v_pfrom date; v_pfrom_ms bigint;
 v_kw jsonb; v_acct jsonb := '[]'::jsonb; v_addr text := null; v_hl jsonb := null;
 c_num constant text := '^-?[0-9]{1,15}(\.[0-9]{1,18})?$';
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

 v_kw := coalesce((select jsonb_agg(jsonb_build_object('date', to_char(s.order_date, 'YYYY-MM-DD'), 'as_of', s.as_of,
     'total', s.snapshot->'realized'->>'reportedTotal',
     'count', jsonb_array_length(s.snapshot->'realized'->'rows')) order by s.order_date)
   from public.kw_snapshots s
   where s.user_id = c.user_id and s.order_date >= v_kst - 45
     and s.snapshot->'realized'->>'apiId' = 'ust21640' and s.snapshot->'realized'->>'currency' = 'USD'
     and jsonb_typeof(s.snapshot->'realized'->'rows') = 'array'
     and coalesce(s.snapshot->'realized'->>'reportedTotal', '') ~ c_num), '[]'::jsonb);

 if to_regclass('public.acct_snapshots') is not null then
  execute $q$ select coalesce(jsonb_agg(jsonb_build_object('market', market, 'day', to_char(day, 'YYYY-MM-DD'), 'value', value,
     'source', source, 'etDate', detail->>'etDate', 'captured_at', (extract(epoch from captured_at) * 1000)::bigint) order by market, day), '[]'::jsonb)
   from public.acct_snapshots where user_id = $1 and day >= $2 $q$ into v_acct using c.user_id, v_kst - 40;
 end if;

 if to_regclass('public.hl_watch') is not null then
  execute 'select lower(address) from public.hl_watch where user_id = $1' into v_addr using c.user_id;
 end if;
 v_pfrom := least(date_trunc('month', v_utc)::date, v_utc - ((extract(isodow from v_utc)::int) - 1), v_utc - 14) - 1;
 if v_addr is not null and to_regclass('public.hl_fills') is not null and to_regclass('public.hl_funding') is not null then
  v_from_ms := (extract(epoch from ((v_utc - 1)::timestamp at time zone 'UTC')) * 1000)::bigint;
  v_pfrom_ms := (extract(epoch from (v_pfrom::timestamp at time zone 'UTC')) * 1000)::bigint;
  execute $q$ select jsonb_build_object('address', $1, 'from', $2,
    'fills', coalesce((select jsonb_agg(jsonb_build_object('tid', f.tid, 'time', f.time, 'coin', f.coin, 'dir', f.raw->>'dir',
        'closedPnl', f.raw->>'closedPnl', 'fee', f.raw->>'fee', 'feeToken', f.raw->>'feeToken') order by f.time, f.tid)
      from (select tid, time, coin, raw from public.hl_fills where address = $1 and time >= $2 order by time limit 5000) f), '[]'::jsonb),
    'funding', coalesce((select jsonb_agg(jsonb_build_object('time', f.time, 'coin', f.coin, 'usdc', f.raw->'delta'->>'usdc') order by f.time, f.coin)
      from (select time, coin, raw from public.hl_funding where address = $1 and time >= $2 order by time limit 5000) f), '[]'::jsonb),
    'last_fill_time', (select max(time) from public.hl_fills where address = $1),
    'days_from', $3,
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'fills', coalesce(a.n, 0), 'trades', coalesce(a.pnl, 0), 'fees', coalesce(a.fees, 0),
        'funding_count', coalesce(b.n, 0), 'funding', coalesce(b.usdc, 0)) order by d.day)
      from (select x.day from (select to_char(to_timestamp(time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day from public.hl_fills where address = $1 and time >= $3
              union select to_char(to_timestamp(time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') from public.hl_funding where address = $1 and time >= $3) x) d
      left join (select to_char(to_timestamp(time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as n,
          sum((raw->>'closedPnl')::numeric - (raw->>'fee')::numeric) as pnl, sum((raw->>'fee')::numeric) as fees
        from public.hl_fills where address = $1 and time >= $3
          and left(coin, 1) <> '@' and position('/' in coin) = 0
          and raw->>'dir' in ('Open Long','Open Short','Close Long','Close Short','Long > Short','Short > Long')
          and raw->>'feeToken' = 'USDC' and coalesce(raw->>'closedPnl', '') ~ $4 and coalesce(raw->>'fee', '') ~ $4
        group by 1) a on a.day = d.day
      left join (select to_char(to_timestamp(time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as n, sum((raw->'delta'->>'usdc')::numeric) as usdc
        from public.hl_funding where address = $1 and time >= $3 and coalesce(raw->'delta'->>'usdc', '') ~ $4
        group by 1) b on b.day = d.day), '[]'::jsonb)) $q$
   into v_hl using v_addr, v_from_ms, v_pfrom_ms, c_num;
 end if;

 return jsonb_build_object('ok', true, 'version', 5, 'now', (extract(epoch from now()) * 1000)::bigint,
  'kst', to_char(v_kst, 'YYYY-MM-DD'), 'utc', to_char(v_utc, 'YYYY-MM-DD'), 'period_from', to_char(v_pfrom, 'YYYY-MM-DD'),
  'kw_days', v_kw, 'acct', v_acct, 'hl', v_hl);
end $$;
revoke all on function public.risk_day_data(text) from public;
grant execute on function public.risk_day_data(text) to anon, authenticated;
commit;

-- Check after running (optional):
--   select proname, prosecdef from pg_proc where proname = 'risk_day_data';   -- 1 row, prosecdef = true
--   select (public.risk_day_data('kwc_…'))->>'version';                       -- '5' (with your collector token)
