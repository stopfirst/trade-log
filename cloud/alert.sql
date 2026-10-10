-- Trade Journal alert1: data for the Telegram loss-limit alert server (trade-alert).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql
-- (hl-collector.sql is optional; without it the Hyperliquid part uses only the saved journal).
-- Safe to run again (create or replace only; no table is created, changed or dropped).
--
-- How it works
--  * The alert server holds the same publishable (anon) key + collector token "kwc_..." as
--    the Kiwoom collector. alert_status(token) authenticates exactly like kw_push
--    (sha256(token) -> kw_collector row, shared 60 calls/minute limit) and returns ONLY that
--    token owner's data. It writes nothing except the shared rate-limit counter.
--  * Returned (read-only):
--    us.kw.days     Kiwoom ust21640 daily realized totals per Korean query date (kw_snapshots)
--    us.kw.latest   latest holdings summary (securities value + USD cash) and reported unrealized PnL
--    us.journal     saved US journal (journal_cloud): settings.limD/limW/limM/account and
--                   compact manual trades (no photos, notes or reviews) with events in the window,
--                   plus broker days already applied in the app (sync.kiwoomBroker.days)
--    hl.fills_daily per UTC date: sum(closedPnl - fee), USDC fee rows only (hl_fills)
--    hl.funding_daily per UTC date: sum(delta.usdc) (hl_funding)
--    hl.closed      latest closed round trips per coin (position back to 0 or flipped)
--    hl.journal     saved HL journal settings + compact trades
--  * Journal payloads can be large (photos). Pass the revision you already have
--    (p_us_revision / p_hl_revision); when unchanged only the revision is returned.
begin;

create or replace function public.alert_event(e jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select case when jsonb_typeof(e) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
  'id', e->'id', 'date', e->'date', 'time', e->'time', 'seq', e->'seq',
  'shares', e->'shares', 'price', e->'price', 'fee', e->'fee', 'amount', e->'amount',
  'sharesText', e->'sharesText', 'priceText', e->'priceText', 'feeText', e->'feeText', 'amountText', e->'amountText',
  'feeKnown', e->'feeKnown', 'sourceKey', e->'sourceKey', 'timestamp', e->'timestamp')) end
$$;
revoke all on function public.alert_event(jsonb) from public, anon, authenticated;

create or replace function public.alert_events(a jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce((select jsonb_agg(public.alert_event(e) order by o) from jsonb_array_elements(case when jsonb_typeof(a)='array' then a else '[]'::jsonb end) with ordinality x(e,o)
  where jsonb_typeof(e)='object'), '[]'::jsonb)
$$;
revoke all on function public.alert_events(jsonb) from public, anon, authenticated;

-- Saved journal of one user/market, compact. p_from = first date (YYYY-MM-DD) of the window.
create or replace function public.alert_journal(p_user uuid, p_scope text, p_from text, p_known bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rev bigint; v_payload jsonb; v_from_ms bigint;
begin
 select revision into v_rev from public.journal_cloud where user_id = p_user and scope = p_scope;
 if not found then return jsonb_build_object('exists', false); end if;
 if p_known is not null and p_known = v_rev then
  return jsonb_build_object('exists', true, 'revision', v_rev, 'unchanged', true);
 end if;
 select payload into v_payload from public.journal_cloud where user_id = p_user and scope = p_scope;
 v_from_ms := (extract(epoch from p_from::date) * 1000)::bigint;
 return jsonb_build_object(
  'exists', true, 'revision', v_rev, 'unchanged', false,
  'settings', jsonb_build_object(
    'limD', v_payload->'settings'->'limD', 'limW', v_payload->'settings'->'limW',
    'limM', v_payload->'settings'->'limM', 'account', v_payload->'settings'->'account'),
  'trades', coalesce((
   select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
     'id', t->'id', 'name', t->'name', 'market', t->'market', 'direction', t->'direction', 'date', t->'date',
     'sync', case when jsonb_typeof(t->'sync') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'source', t->'sync'->'source', 'journalKind', t->'sync'->'journalKind', 'account', t->'sync'->'account',
        'positionStatus', t->'sync'->'positionStatus', 'pnlBasis', t->'sync'->'pnlBasis',
        'historyComplete', t->'sync'->'historyComplete')) end,
     'entries', public.alert_events(t->'entries'),
     'fills', public.alert_events(t->'fills'),
     'funding', public.alert_events(t->'funding'))))
   from jsonb_array_elements(case when jsonb_typeof(v_payload->'trades') = 'array' then v_payload->'trades' else '[]'::jsonb end) t
   where jsonb_typeof(t) = 'object'
     -- Kiwoom broker records are taken from the daily reports below, not from trades.
     and not (t->'sync'->>'source' = 'kiwoom' and coalesce(t->>'market','') <> 'HL'
              and coalesce(t->'sync'->>'journalKind','') in ('day','holding','retired'))
     and exists (
      select 1 from jsonb_array_elements(
        (case when jsonb_typeof(t->'entries') = 'array' then t->'entries' else '[]'::jsonb end)
        || (case when jsonb_typeof(t->'fills') = 'array' then t->'fills' else '[]'::jsonb end)
        || (case when jsonb_typeof(t->'funding') = 'array' then t->'funding' else '[]'::jsonb end)) e
      where jsonb_typeof(e) = 'object' and e->>'date' >= p_from)
  ), '[]'::jsonb),
  'broker_days', case when p_scope = 'US' and jsonb_typeof(v_payload->'sync'->'kiwoomBroker'->'days') = 'object' then coalesce((
   select jsonb_agg(jsonb_build_object('date', d.key, 'as_of', d.value->'asOf',
     'total', d.value->'realized'->'reportedTotal',
     'rows', coalesce((select jsonb_agg(jsonb_build_object('symbol', r->'symbol', 'net', r->'reportedNet'))
       from jsonb_array_elements(case when jsonb_typeof(d.value->'realized'->'rows')='array' then d.value->'realized'->'rows' else '[]'::jsonb end) r), '[]'::jsonb))
     order by d.key)
   from jsonb_each(v_payload->'sync'->'kiwoomBroker'->'days') d where d.key >= p_from), '[]'::jsonb) else '[]'::jsonb end,
  'hl_account', case when p_scope = 'HL' then v_payload->'sync'->'hyperliquid'->'account' end,
  'account_funding', case when p_scope = 'HL' and jsonb_typeof(v_payload->'sync'->'hyperliquid'->'accountFunding'->'unassignedRecords') = 'array' then coalesce((
   select jsonb_agg(jsonb_build_object('sourceKey', f->'sourceKey', 'timestamp', f->'timestamp', 'amount', f->'amount'))
   from jsonb_array_elements(v_payload->'sync'->'hyperliquid'->'accountFunding'->'unassignedRecords') f
   where jsonb_typeof(f->'timestamp') = 'number' and (f->>'timestamp')::numeric >= v_from_ms), '[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.alert_journal(uuid, text, text, bigint) from public, anon, authenticated;

-- Hyperliquid raw collector data (hl-collector.sql). Only called when those tables exist.
create or replace function public.alert_hl(p_user uuid, p_from text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w record; v_from_ms bigint := (extract(epoch from p_from::date) * 1000)::bigint;
 c_num constant text := '^-?[0-9]{1,15}(\.[0-9]{1,18})?$';
begin
 select address, last_ok_at, last_error, fills_cursor into w from public.hl_watch where user_id = p_user;
 if not found then return jsonb_build_object('registered', false); end if;
 return jsonb_build_object(
  'registered', true,
  'address', w.address,
  'last_ok_at', w.last_ok_at,
  'last_error', w.last_error,
  'last_fill_time', (select max(f.time) from public.hl_fills f where f.address = w.address),
  'fills_daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'pnl', pnl, 'fees', fees, 'count', n) order by d) from (
    select to_char(to_timestamp(f.time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') d,
           sum((f.raw->>'closedPnl')::numeric - (f.raw->>'fee')::numeric) pnl,
           sum((f.raw->>'fee')::numeric) fees, count(*) n
    from public.hl_fills f
    where f.address = w.address and f.time >= v_from_ms and f.raw->>'feeToken' = 'USDC'
      and f.raw->>'closedPnl' ~ c_num and f.raw->>'fee' ~ c_num
    group by 1) x), '[]'::jsonb),
  'skipped_fills', (select count(*) from public.hl_fills f where f.address = w.address and f.time >= v_from_ms
      and not (coalesce(f.raw->>'feeToken','') = 'USDC' and coalesce(f.raw->>'closedPnl','') ~ c_num and coalesce(f.raw->>'fee','') ~ c_num)),
  'funding_daily', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'amount', amt, 'count', n) order by d) from (
    select to_char(to_timestamp(f.time / 1000.0) at time zone 'UTC', 'YYYY-MM-DD') d,
           sum((f.raw->'delta'->>'usdc')::numeric) amt, count(*) n
    from public.hl_funding f
    where f.address = w.address and f.time >= v_from_ms and f.raw->'delta'->>'usdc' ~ c_num
    group by 1) x), '[]'::jsonb),
  -- Round trips: a fill closes a trade when the position returns to 0 or flips sign.
  -- Trade result = sum(closedPnl - fee) of its fills inside the window (funding not included).
  'closed', coalesce((select jsonb_agg(jsonb_build_object('coin', coin, 'closed_at', closed_at, 'pnl', pnl) order by closed_at desc, coin) from (
    select coin, grp, max(time) closed_at, sum(net) pnl from (
     select g.*, coalesce(sum(case when g.closes then 1 else 0 end) over (partition by g.coin order by g.time, g.tid
             rows between unbounded preceding and 1 preceding), 0) grp
     from (
      select f.coin, f.time, f.tid,
             (f.raw->>'closedPnl')::numeric - (f.raw->>'fee')::numeric net,
             ((f.raw->>'startPosition')::numeric <> 0 and (
               (f.raw->>'startPosition')::numeric + (case when f.raw->>'side' = 'B' then 1 else -1 end) * (f.raw->>'sz')::numeric = 0
               or sign((f.raw->>'startPosition')::numeric + (case when f.raw->>'side' = 'B' then 1 else -1 end) * (f.raw->>'sz')::numeric)
                  <> sign((f.raw->>'startPosition')::numeric))) closes
      from public.hl_fills f
      where f.address = w.address and f.time >= v_from_ms and f.raw->>'feeToken' = 'USDC'
        and f.raw->>'closedPnl' ~ c_num and f.raw->>'fee' ~ c_num
        and f.raw->>'startPosition' ~ c_num and f.raw->>'sz' ~ c_num and f.raw->>'side' in ('A','B')
     ) g
    ) h
    group by coin, grp having bool_or(closes)
    order by max(time) desc limit 30) y), '[]'::jsonb));
end $$;
revoke all on function public.alert_hl(uuid, text) from public, anon, authenticated;

-- The one function the alert server calls (publishable key + collector token).
create or replace function public.alert_status(p_token text, p_us_revision bigint default null,
 p_hl_revision bigint default null, p_days integer default 62)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_days int := least(120, greatest(14, coalesce(p_days, 62)));
 v_from date; v_kw jsonb; v_latest record; v_hl jsonb := jsonb_build_object('registered', false, 'installed', false);
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 v_from := (now() at time zone 'UTC')::date - v_days;
 select order_date, as_of, snapshot into v_latest from public.kw_snapshots where user_id = c.user_id order by as_of desc limit 1;
 v_kw := jsonb_build_object(
  'account', c.account,
  'last_push_at', c.last_push_at,
  'last_seen_at', c.last_seen_at,
  'days', coalesce((select jsonb_agg(jsonb_build_object(
     'date', to_char(s.order_date, 'YYYY-MM-DD'), 'as_of', s.as_of,
     'total', s.snapshot->'realized'->'reportedTotal',
     'rows', coalesce((select jsonb_agg(jsonb_build_object('symbol', r->'symbol', 'net', r->'reportedNet',
        't', (select max(o->>'reportedTime') from jsonb_array_elements(s.snapshot->'orders') o
              where o->>'symbol' = r->>'symbol' and o->>'side' = '매도')))
       from jsonb_array_elements(s.snapshot->'realized'->'rows') r), '[]'::jsonb))
     order by s.order_date)
   from public.kw_snapshots s where s.user_id = c.user_id and s.order_date >= v_from), '[]'::jsonb),
  'latest', case when v_latest.as_of is null then null else jsonb_build_object(
     'date', to_char(v_latest.order_date, 'YYYY-MM-DD'), 'as_of', v_latest.as_of,
     'summary', v_latest.snapshot->'summary',
     'positions', coalesce((select jsonb_agg(jsonb_build_object('symbol', p->'symbol', 'quantity', p->'quantity', 'reportedPnl', p->'reportedPnl'))
        from jsonb_array_elements(v_latest.snapshot->'positions') p), '[]'::jsonb)) end);
 if to_regclass('public.hl_watch') is not null and to_regclass('public.hl_fills') is not null and to_regclass('public.hl_funding') is not null then
  v_hl := public.alert_hl(c.user_id, to_char(v_from, 'YYYY-MM-DD')) || jsonb_build_object('installed', true);
 end if;
 return jsonb_build_object(
  'ok', true, 'version', 1, 'now', (extract(epoch from now()) * 1000)::bigint, 'from', to_char(v_from, 'YYYY-MM-DD'),
  'us', jsonb_build_object('kw', v_kw, 'journal', public.alert_journal(c.user_id, 'US', to_char(v_from, 'YYYY-MM-DD'), p_us_revision)),
  'hl', jsonb_build_object('raw', v_hl, 'journal', public.alert_journal(c.user_id, 'HL', to_char(v_from, 'YYYY-MM-DD'), p_hl_revision)));
end $$;
revoke all on function public.alert_status(text, bigint, bigint, integer) from public;
grant execute on function public.alert_status(text, bigint, bigint, integer) to anon, authenticated;
commit;

-- Check after running (optional):
--   select proname from pg_proc where proname like 'alert_%';
