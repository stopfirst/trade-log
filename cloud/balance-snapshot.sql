-- Trade Journal v17: daily close account balance (Hyperliquid + Kiwoom US).
-- Run ONCE in Supabase SQL Editor AFTER cloud.sql, hl-collector.sql and kiwoom-collector.sql.
-- Safe to run again (idempotent). Existing rows are kept.
--
-- What it stores
--  * public.acct_snapshots: one balance per (user, market, day).
--      market 'hl' : day = UTC date. value = account balance at the end of that UTC day,
--                    read right after 00:00 UTC of the next day (source 'close').
--                    Same rule as the app's BALANCE (shared/account-balance.cjs):
--                    unifiedAccount / portfolioMargin -> Spot USDC total;
--                    default / disabled -> main Perps accountValue + Spot USDC + every HIP-3 dex
--                    whose collateral is USDC (token 0).
--                    Past days (before this file was installed) can be filled once as
--                    source 'approx' from Hyperliquid "portfolio" accountValueHistory.
--      market 'us' : day = Korean date (Asia/Seoul) of the first collector round after 16:10
--                    America/New_York on a US weekday (= the Korean date Kiwoom uses for those
--                    records). value = securities value (ust21070) + USD cash (ust21160),
--                    the app's ACCOUNT BASIS. Pushed by the Kiwoom collector v1.2.0 with its
--                    kwc_ token through kw_push_balance(). No past US data (no cash history).
--  * App users can only SELECT their own rows. Every write goes through the functions below.
--  * pg_cron runs public.acct_balance_tick() every minute: it ingests finished pg_net
--    responses and, during 00:00-00:59 UTC, fires the reads for the day that just closed
--    (retrying with backoff). The wallet address travels only in the POST body.
-- Requires pg_cron and pg_net (already enabled by hl-collector.sql).
begin;

create extension if not exists pg_cron; -- @extension
create extension if not exists pg_net with schema extensions; -- @extension

-- 1. Daily balances ------------------------------------------------------------------
create table if not exists public.acct_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null check (market in ('hl','us')),
 day date not null,
 value numeric not null check (abs(value) < 1000000000000),
 source text not null check (source in ('close','approx')),
 captured_at timestamptz not null default now(),
 detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
 primary key (user_id, market, day)
);
create index if not exists acct_snapshots_user_market_day on public.acct_snapshots(user_id, market, day desc);

-- 2. Internal state for the Hyperliquid reads --------------------------------------------
create table if not exists public.acct_hl_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_close_day date,
 last_close_at timestamptz,
 attempts integer not null default 0,
 retry_after timestamptz,
 last_error text,
 last_error_at timestamptz,
 backfill_requested_at timestamptz,
 backfill_done_at timestamptz,
 backfill_days integer,
 backfill_error text
);
create table if not exists public.acct_hl_batch (
 batch_id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 address text not null,
 purpose text not null check (purpose in ('close','backfill')),
 day date,
 phase integer not null default 1,
 started_at timestamptz not null default now()
);
create index if not exists acct_hl_batch_user on public.acct_hl_batch(user_id, purpose);
create table if not exists public.acct_hl_pending (
 request_id bigint primary key,
 batch_id bigint not null references public.acct_hl_batch(batch_id) on delete cascade,
 kind text not null check (kind in ('mode','spot','perp','dexs','meta','dexstate','portfolio')),
 dex text,
 created_at timestamptz not null default now(),
 done boolean not null default false,
 content jsonb,
 error text
);
create index if not exists acct_hl_pending_batch on public.acct_hl_pending(batch_id);

-- 3. Privileges and row level security -------------------------------------------------
alter table public.acct_snapshots enable row level security;
alter table public.acct_hl_state enable row level security;
alter table public.acct_hl_batch enable row level security;
alter table public.acct_hl_pending enable row level security;
revoke all on public.acct_snapshots, public.acct_hl_state, public.acct_hl_batch, public.acct_hl_pending from public, anon, authenticated;
grant select on public.acct_snapshots to authenticated;
drop policy if exists acct_snapshots_own_select on public.acct_snapshots;
create policy acct_snapshots_own_select on public.acct_snapshots for select to authenticated
 using (user_id = (select auth.uid()));
-- acct_hl_state / acct_hl_batch / acct_hl_pending: no grant, no policy. Internal only.

-- 4. Helpers -------------------------------------------------------------------------------
-- Same decimal rule as account-balance.cjs dec(): signed, <= 15 integer digits, <= 18 decimals.
create or replace function public.acct_dec(p text)
returns numeric language sql immutable set search_path='' as $$
 select case when p ~ '^-?[0-9]{1,15}(\.[0-9]{1,18})?$' then p::numeric else null end
$$;
revoke all on function public.acct_dec(text) from public, anon, authenticated;

create or replace function public.acct_hl_fire(p_batch bigint, p_kind text, p_body jsonb, p_dex text default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_req bigint;
begin
 v_req := net.http_post(
  url := 'https://api.hyperliquid.xyz/info',
  body := p_body,
  headers := jsonb_build_object('Content-Type','application/json'),
  timeout_milliseconds := 20000);
 insert into public.acct_hl_pending(request_id, batch_id, kind, dex) values (v_req, p_batch, p_kind, p_dex);
 return v_req;
end $$;
revoke all on function public.acct_hl_fire(bigint,text,jsonb,text) from public, anon, authenticated;

create or replace function public.acct_hl_note_error(p_user uuid, p_message text, p_now timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.acct_hl_state(user_id) values (p_user) on conflict (user_id) do nothing;
 update public.acct_hl_state set
  attempts = attempts + 1,
  last_error = left(coalesce(p_message,'unknown error'), 300),
  last_error_at = p_now,
  -- 2, 4, 8, then 10 minutes between retries (the close window is one hour).
  retry_after = p_now + make_interval(mins => least(10, power(2, least(attempts + 1, 4))::int))
 where user_id = p_user;
end $$;
revoke all on function public.acct_hl_note_error(uuid,text,timestamptz) from public, anon, authenticated;

-- Pick one balance per UTC day from portfolio accountValueHistory.
-- For day D the reference instant is (D+1) 00:00 UTC (= the close of D). The candidates are the
-- last point at or before it and the first point at or after it; the nearer one wins (tie: before).
-- Days start at the UTC date of the first non-zero point and end at p_last_day. A day whose
-- nearest point is more than 24 h away is skipped. Returns one row per day.
create or replace function public.acct_hl_pick_days(p_portfolio jsonb, p_last_day date)
returns table(day date, value numeric, point_ms bigint, ref_ms bigint, gap_ms bigint, side text)
language sql stable set search_path='' as $$
 with win as (
  select w->>0 as name, w->1->'accountValueHistory' as h
  from jsonb_array_elements(case when jsonb_typeof(p_portfolio) = 'array' then p_portfolio else '[]'::jsonb end) w
  where jsonb_typeof(w) = 'array' and w->>0 in ('day','week','month','allTime')
    and jsonb_typeof(w->1->'accountValueHistory') = 'array'
 ), raw as (
  select (p->>0)::bigint as t, public.acct_dec(p->>1) as v,
         case win.name when 'allTime' then 1 when 'month' then 2 when 'week' then 3 else 4 end as pri
  from win, jsonb_array_elements(win.h) p
  where jsonb_typeof(p) = 'array' and jsonb_typeof(p->0) = 'number' and (p->>0) ~ '^[0-9]{1,15}$'
    and jsonb_typeof(p->1) = 'string'
 ), pts as (
  select distinct on (t) t, v from raw where v is not null order by t, pri
 ), bounds as (
  select (to_timestamp(min(t) / 1000.0) at time zone 'UTC')::date as first_day from pts where v <> 0
 ), days as (
  select d::date as day,
         (extract(epoch from ((d::date + 1)::timestamp at time zone 'UTC')) * 1000)::bigint as ref_ms
  from bounds, generate_series(greatest(bounds.first_day, p_last_day - 400), p_last_day, interval '1 day') d
  where bounds.first_day is not null and bounds.first_day <= p_last_day
 ), cand as (
  select days.day, days.ref_ms,
   (select t from pts where t <= days.ref_ms order by t desc limit 1) as bt,
   (select v from pts where t <= days.ref_ms order by t desc limit 1) as bv,
   (select t from pts where t >= days.ref_ms order by t limit 1) as at,
   (select v from pts where t >= days.ref_ms order by t limit 1) as av
  from days
 ), chosen as (
  select day, ref_ms,
   case when bt is not null and (at is null or ref_ms - bt <= at - ref_ms) then bt else at end as pt,
   case when bt is not null and (at is null or ref_ms - bt <= at - ref_ms) then bv else av end as pv,
   case when bt is not null and (at is null or ref_ms - bt <= at - ref_ms) then 'before' else 'after' end as sd
  from cand where bt is not null or at is not null
 )
 select day, pv, pt, ref_ms, abs(pt - ref_ms), sd from chosen
 where pt is not null and abs(pt - ref_ms) <= 86400000
 order by day
$$;
revoke all on function public.acct_hl_pick_days(jsonb,date) from public, anon, authenticated;

-- Finish a batch whose responses have all arrived. Returns 'stored' | 'phase2' | 'error' | 'backfill'.
create or replace function public.acct_hl_finish(p_batch bigint, p_now timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare
 b public.acct_hl_batch; v_err text; v_mode text; v_spot jsonb; v_perp jsonb; v_dexs jsonb;
 v_usdc numeric; v_value numeric; v_main numeric; v_names text[]; v_name text; v_n int;
 v_started bigint; v_meta jsonb; v_state jsonb; v_amt numeric; v_comp jsonb := '[]'::jsonb; v_excl jsonb := '[]'::jsonb;
 v_nonusdc jsonb; v_rows int; v_point record; v_last date;
begin
 select * into b from public.acct_hl_batch where batch_id = p_batch for update;
 if not found then return 'gone'; end if;
 select string_agg(distinct p.error, ' · ') into v_err from public.acct_hl_pending p where p.batch_id = p_batch and p.error is not null;
 if v_err is not null then
  if b.purpose = 'close' then perform public.acct_hl_note_error(b.user_id, 'close ' || b.day || ': ' || v_err, p_now);
  else
   insert into public.acct_hl_state(user_id) values (b.user_id) on conflict (user_id) do nothing;
   update public.acct_hl_state set backfill_error = left(v_err, 300), backfill_done_at = p_now where user_id = b.user_id;
  end if;
  delete from public.acct_hl_batch where batch_id = p_batch;
  return 'error';
 end if;

 if b.purpose = 'backfill' then
  select content into v_state from public.acct_hl_pending where batch_id = p_batch and kind = 'portfolio';
  v_last := (p_now at time zone 'UTC')::date - 1;
  v_n := 0;
  for v_point in select * from public.acct_hl_pick_days(v_state, v_last) loop
   insert into public.acct_snapshots as t (user_id, market, day, value, source, captured_at, detail)
   values (b.user_id, 'hl', v_point.day, v_point.value, 'approx', p_now, jsonb_build_object(
    'basis', 'portfolio.accountValueHistory', 'address', b.address,
    'ref_ms', v_point.ref_ms, 'point_ms', v_point.point_ms, 'gap_ms', v_point.gap_ms, 'side', v_point.side,
    'note', 'Hyperliquid portfolio 계좌가치(미실현 손익·USDC 외 Spot 포함 가능) · 가장 가까운 기록점'))
   on conflict (user_id, market, day) do update set
    value = excluded.value, source = excluded.source, captured_at = excluded.captured_at, detail = excluded.detail
   where t.source = 'approx';
   get diagnostics v_rows = row_count;
   v_n := v_n + v_rows;
  end loop;
  insert into public.acct_hl_state(user_id) values (b.user_id) on conflict (user_id) do nothing;
  update public.acct_hl_state set backfill_done_at = p_now, backfill_days = v_n, backfill_error = null where user_id = b.user_id;
  delete from public.acct_hl_batch where batch_id = p_batch;
  return 'backfill';
 end if;

 -- close: phase 1 = userAbstraction + spotClearinghouseState + clearinghouseState(main) + perpDexs
 v_started := (extract(epoch from b.started_at) * 1000)::bigint;
 select content into v_spot from public.acct_hl_pending where batch_id = p_batch and kind = 'spot';
 select content into v_perp from public.acct_hl_pending where batch_id = p_batch and kind = 'perp';
 select content into v_dexs from public.acct_hl_pending where batch_id = p_batch and kind = 'dexs';
 select content #>> '{}' into v_mode from public.acct_hl_pending where batch_id = p_batch and kind = 'mode';
 v_err := null;
 if v_mode is null or v_mode not in ('unifiedAccount','portfolioMargin','disabled','default') then v_err := 'HL_BALANCE_UNSUPPORTED_MODE';
 elsif jsonb_typeof(v_spot->'balances') is distinct from 'array' then v_err := 'HL_BALANCE_INVALID_SPOT';
 elsif exists (select 1 from jsonb_array_elements(v_spot->'balances') r
   where jsonb_typeof(r->'token') is distinct from 'number' or (r->>'token') !~ '^[0-9]{1,9}$'
      or jsonb_typeof(r->'coin') is distinct from 'string' or (r->>'coin') !~ '^[A-Za-z0-9_:./-]{1,64}$'
      or public.acct_dec(r->>'total') is null or public.acct_dec(r->>'hold') is null
      or ((r->>'token') = '0' and (r->>'coin') <> 'USDC')) then v_err := 'HL_BALANCE_INVALID_TOKEN';
 elsif (select count(*) <> count(distinct r->>'token') from jsonb_array_elements(v_spot->'balances') r) then v_err := 'HL_BALANCE_INVALID_TOKEN';
 end if;
 if v_err is not null then
  perform public.acct_hl_note_error(b.user_id, 'close ' || b.day || ': ' || v_err, p_now);
  delete from public.acct_hl_batch where batch_id = p_batch; return 'error';
 end if;
 select coalesce((select public.acct_dec(r->>'total') from jsonb_array_elements(v_spot->'balances') r where (r->>'token') = '0' limit 1), 0) into v_usdc;
 select coalesce(jsonb_agg(jsonb_build_object('coin', r->>'coin', 'total', r->>'total')), '[]'::jsonb) into v_nonusdc
  from jsonb_array_elements(v_spot->'balances') r where (r->>'token') <> '0' and public.acct_dec(r->>'total') <> 0;

 if v_mode in ('unifiedAccount','portfolioMargin') then
  v_value := v_usdc;
  v_comp := jsonb_build_array(jsonb_build_object('venue','Unified','amount', v_usdc::text));
 else
  -- default / disabled: main perps + spot + USDC-collateral HIP-3 dexs
  v_main := public.acct_dec(v_perp->'marginSummary'->>'accountValue');
  if jsonb_typeof(v_perp->'assetPositions') is distinct from 'array' or v_main is null then v_err := 'HL_BALANCE_INVALID_PERPS';
  elsif jsonb_typeof(v_perp->'time') is distinct from 'number' or abs((v_perp->>'time')::numeric - v_started) > 300000 then v_err := 'HL_BALANCE_STALE_UPSTREAM';
  elsif jsonb_typeof(v_dexs) is distinct from 'array' or v_dexs->0 <> 'null'::jsonb or jsonb_array_length(v_dexs) > 33 then v_err := 'HL_BALANCE_INVALID_DEX_LIST';
  else
   select coalesce(array_agg(d->>'name' order by o), '{}') into v_names from jsonb_array_elements(v_dexs) with ordinality as x(d, o) where o > 1;
   if exists (select 1 from unnest(v_names) nm where nm is null or nm !~ '^[A-Za-z0-9_-]{1,64}$')
      or cardinality(v_names) <> (select count(distinct nm) from unnest(v_names) nm) then v_err := 'HL_BALANCE_INVALID_DEX_LIST'; end if;
  end if;
  if v_err is not null then
   perform public.acct_hl_note_error(b.user_id, 'close ' || b.day || ': ' || v_err, p_now);
   delete from public.acct_hl_batch where batch_id = p_batch; return 'error';
  end if;
  if b.phase = 1 and cardinality(v_names) > 0 then
   foreach v_name in array v_names loop
    perform public.acct_hl_fire(p_batch, 'meta', jsonb_build_object('type','metaAndAssetCtxs','dex',v_name), v_name);
    perform public.acct_hl_fire(p_batch, 'dexstate', jsonb_build_object('type','clearinghouseState','user',lower(b.address),'dex',v_name), v_name);
   end loop;
   update public.acct_hl_batch set phase = 2 where batch_id = p_batch;
   return 'phase2';
  end if;
  v_value := v_main + v_usdc;
  v_comp := jsonb_build_array(jsonb_build_object('venue','Perps','amount', v_main::text), jsonb_build_object('venue','Spot','amount', v_usdc::text));
  foreach v_name in array v_names loop
   select content into v_meta from public.acct_hl_pending where batch_id = p_batch and kind = 'meta' and dex = v_name;
   select content into v_state from public.acct_hl_pending where batch_id = p_batch and kind = 'dexstate' and dex = v_name;
   if jsonb_typeof(v_meta) is distinct from 'array' or jsonb_array_length(v_meta) <> 2 or jsonb_typeof(v_meta->1) is distinct from 'array'
      or jsonb_typeof(v_meta->0->'universe') is distinct from 'array' or jsonb_typeof(v_meta->0->'collateralToken') is distinct from 'number'
      or (v_meta->0->>'collateralToken') !~ '^[0-9]{1,9}$' then v_err := 'HL_BALANCE_UNKNOWN_COLLATERAL'; exit; end if;
   if (v_meta->0->>'collateralToken') <> '0' then
    v_excl := v_excl || jsonb_build_array(jsonb_build_object('dex', v_name, 'collateralToken', (v_meta->0->>'collateralToken')::int));
    continue;
   end if;
   v_amt := public.acct_dec(v_state->'marginSummary'->>'accountValue');
   if jsonb_typeof(v_state->'assetPositions') is distinct from 'array' or v_amt is null then v_err := 'HL_BALANCE_INVALID_PERPS'; exit; end if;
   if jsonb_typeof(v_state->'time') is distinct from 'number' or abs((v_state->>'time')::numeric - v_started) > 300000 then v_err := 'HL_BALANCE_STALE_UPSTREAM'; exit; end if;
   v_value := v_value + v_amt;
   v_comp := v_comp || jsonb_build_array(jsonb_build_object('venue','HIP-3','dex',v_name,'amount',v_amt::text));
  end loop;
  if v_err is not null then
   perform public.acct_hl_note_error(b.user_id, 'close ' || b.day || ': ' || v_err, p_now);
   delete from public.acct_hl_batch where batch_id = p_batch; return 'error';
  end if;
 end if;

 insert into public.acct_snapshots as t (user_id, market, day, value, source, captured_at, detail)
 values (b.user_id, 'hl', b.day, v_value, 'close', p_now, jsonb_build_object(
  'basis', 'BALANCE', 'address', b.address, 'accountMode', v_mode,
  'scope', case when v_mode in ('unifiedAccount','portfolioMargin') then '통합 USDC 거래잔고' else 'USDC Spot + 전체 USDC Perps' end,
  'components', v_comp, 'excludedDexs', v_excl, 'nonUsdcAssets', v_nonusdc,
  'perpAccountValue', v_perp->'marginSummary'->>'accountValue',
  'requested_at', b.started_at,
  'lag_sec', round(extract(epoch from (b.started_at - ((b.day + 1)::timestamp at time zone 'UTC'))))))
 on conflict (user_id, market, day) do update set
  value = excluded.value, source = excluded.source, captured_at = excluded.captured_at, detail = excluded.detail
 where t.source <> 'close';
 insert into public.acct_hl_state(user_id) values (b.user_id) on conflict (user_id) do nothing;
 update public.acct_hl_state set last_close_day = greatest(last_close_day, b.day), last_close_at = p_now,
  attempts = 0, retry_after = null, last_error = null, last_error_at = null where user_id = b.user_id;
 delete from public.acct_hl_batch where batch_id = p_batch;
 return 'stored';
end $$;
revoke all on function public.acct_hl_finish(bigint,timestamptz) from public, anon, authenticated;

-- 5. The tick (cron, every minute) ---------------------------------------------------------
create or replace function public.acct_balance_tick(p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz := coalesce(p_now, now());
 v_day date := (coalesce(p_now, now()) at time zone 'UTC')::date - 1;
 v_hour int := extract(hour from (coalesce(p_now, now()) at time zone 'UTC'))::int;
 p record; r record; w record; v_content jsonb; v_batch bigint; v_res text;
 v_ingested int := 0; v_fired int := 0; v_stored int := 0; v_errors int := 0;
begin
 if not pg_try_advisory_xact_lock(hashtext('public.acct_balance_tick')) then
  return jsonb_build_object('skipped', true);
 end if;
 -- (a) collect finished responses
 for p in select * from public.acct_hl_pending where not done order by request_id for update loop
  select resp.status_code, resp.content, resp.timed_out, resp.error_msg into r
   from net._http_response resp where resp.id = p.request_id;
  if not found then
   if p.created_at < v_now - interval '5 minutes' then
    update public.acct_hl_pending set done = true, error = '응답 없음(5분 초과)' where request_id = p.request_id;
   end if;
   continue;
  end if;
  v_ingested := v_ingested + 1;
  if coalesce(r.timed_out, false) or r.error_msg is not null or r.status_code is distinct from 200 then
   update public.acct_hl_pending set done = true, error =
    case when coalesce(r.timed_out,false) then '시간 초과'
         when r.error_msg is not null then left(r.error_msg, 150)
         when r.status_code = 429 then 'HTTP 429 요청 한도'
         else 'HTTP ' || coalesce(r.status_code::text,'?') end
   where request_id = p.request_id;
   continue;
  end if;
  begin v_content := r.content::jsonb; exception when others then v_content := null; end;
  if v_content is null then
   update public.acct_hl_pending set done = true, error = '응답 형식 오류' where request_id = p.request_id;
  else
   update public.acct_hl_pending set done = true, content = v_content where request_id = p.request_id;
  end if;
 end loop;
 -- (b) finish batches whose responses are all in
 for v_batch in select b.batch_id from public.acct_hl_batch b
   where not exists (select 1 from public.acct_hl_pending q where q.batch_id = b.batch_id and not q.done)
   order by b.batch_id loop
  v_res := public.acct_hl_finish(v_batch, v_now);
  if v_res in ('stored','backfill') then v_stored := v_stored + 1; elsif v_res = 'error' then v_errors := v_errors + 1; end if;
 end loop;
 -- (c) fire the close reads for the UTC day that just ended (00:00-00:59 UTC only)
 if v_hour = 0 then
  for w in select hw.user_id, hw.address from public.hl_watch hw
    left join public.acct_hl_state s on s.user_id = hw.user_id
    where (s.retry_after is null or s.retry_after <= v_now)
      and not exists (select 1 from public.acct_snapshots a where a.user_id = hw.user_id and a.market = 'hl' and a.day = v_day and a.source = 'close')
      and not exists (select 1 from public.acct_hl_batch b where b.user_id = hw.user_id and b.purpose = 'close')
  loop
   insert into public.acct_hl_batch(user_id, address, purpose, day, started_at) values (w.user_id, w.address, 'close', v_day, v_now) returning batch_id into v_batch;
   perform public.acct_hl_fire(v_batch, 'mode', jsonb_build_object('type','userAbstraction','user',lower(w.address)));
   perform public.acct_hl_fire(v_batch, 'spot', jsonb_build_object('type','spotClearinghouseState','user',lower(w.address)));
   perform public.acct_hl_fire(v_batch, 'perp', jsonb_build_object('type','clearinghouseState','user',lower(w.address)));
   perform public.acct_hl_fire(v_batch, 'dexs', jsonb_build_object('type','perpDexs'));
   v_fired := v_fired + 1;
  end loop;
 end if;
 return jsonb_build_object('ingested', v_ingested, 'fired', v_fired, 'stored', v_stored, 'errors', v_errors);
end $$;
revoke all on function public.acct_balance_tick(timestamptz) from public, anon, authenticated;

-- 6. Past HL days (approx) ----------------------------------------------------------------
create or replace function public.acct_hl_queue_backfill(p_user uuid, p_now timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w record; v_batch bigint; v_now timestamptz := coalesce(p_now, now());
begin
 select * into w from public.hl_watch where user_id = p_user;
 if not found then return jsonb_build_object('ok', false, 'error', 'no_hl_address'); end if;
 if exists (select 1 from public.acct_hl_batch b where b.user_id = p_user and b.purpose = 'backfill') then
  return jsonb_build_object('ok', true, 'queued', false, 'reason', 'already_pending');
 end if;
 insert into public.acct_hl_state(user_id) values (p_user) on conflict (user_id) do nothing;
 update public.acct_hl_state set backfill_requested_at = v_now, backfill_error = null where user_id = p_user;
 insert into public.acct_hl_batch(user_id, address, purpose, started_at) values (p_user, w.address, 'backfill', v_now) returning batch_id into v_batch;
 perform public.acct_hl_fire(v_batch, 'portfolio', jsonb_build_object('type','portfolio','user',lower(w.address)));
 return jsonb_build_object('ok', true, 'queued', true);
end $$;
revoke all on function public.acct_hl_queue_backfill(uuid,timestamptz) from public, anon, authenticated;

-- App button (logged-in user). At most once every 10 minutes. Never overwrites a 'close' row.
create or replace function public.acct_hl_backfill()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); s record;
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 select * into s from public.acct_hl_state where user_id = v_user;
 if found and s.backfill_requested_at > now() - interval '10 minutes' and s.backfill_error is null
    and not exists (select 1 from public.acct_hl_batch b where b.user_id = v_user and b.purpose = 'backfill') then
  return jsonb_build_object('ok', false, 'error', 'too_soon', 'backfill_done_at', s.backfill_done_at, 'backfill_days', s.backfill_days);
 end if;
 return public.acct_hl_queue_backfill(v_user);
end $$;
revoke all on function public.acct_hl_backfill() from public, anon;
grant execute on function public.acct_hl_backfill() to authenticated;

-- SQL Editor alternative: queue the backfill for every registered HL address.
--   select public.acct_hl_backfill_all();   then wait 1-2 minutes (the tick ingests it).
create or replace function public.acct_hl_backfill_all()
returns integer language plpgsql security definer set search_path='' as $$
declare w record; v_n int := 0; v_r jsonb;
begin
 for w in select user_id from public.hl_watch loop
  v_r := public.acct_hl_queue_backfill(w.user_id);
  if (v_r->>'queued')::boolean then v_n := v_n + 1; end if;
 end loop;
 return v_n;
end $$;
revoke all on function public.acct_hl_backfill_all() from public, anon, authenticated;

-- 7. US close balance pushed by the Kiwoom collector (kw_ token, same pattern as kw_push) ------
create or replace function public.kw_push_balance(p_token text, p_day date, p_value numeric, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; v_today date := (now() at time zone 'Asia/Seoul')::date; v_rows int;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return public.kw_reject(c.user_id, 'rate_limited'); end if;
 if p_day is null or p_day < v_today - 3 or p_day > v_today + 1 then return public.kw_reject(c.user_id, 'balance_day_out_of_range'); end if;
 if p_value is null or p_value < 0 or p_value >= 1000000000000 or scale(p_value) > 6 then return public.kw_reject(c.user_id, 'balance_bad_value'); end if;
 if p_detail is null or jsonb_typeof(p_detail) <> 'object' or octet_length(p_detail::text) > 4000 then return public.kw_reject(c.user_id, 'balance_bad_detail'); end if;
 if jsonb_typeof(p_detail->'account') is distinct from 'string' or (p_detail->>'account') !~ '^[0-9a-f]{16}$' then return public.kw_reject(c.user_id, 'balance_bad_account'); end if;
 if c.account is not null and c.account <> p_detail->>'account' then return public.kw_reject(c.user_id, 'account_mismatch'); end if;
 -- The first close of a day wins (a restarted collector later in the evening does not replace it).
 insert into public.acct_snapshots as t (user_id, market, day, value, source, captured_at, detail)
 values (c.user_id, 'us', p_day, p_value, 'close', now(), p_detail)
 on conflict (user_id, market, day) do update set
  value = excluded.value, source = excluded.source, captured_at = excluded.captured_at, detail = excluded.detail
 where t.source <> 'close';
 get diagnostics v_rows = row_count;
 update public.kw_collector set last_seen_at = now(), last_reject = null, last_reject_at = null where user_id = c.user_id;
 return jsonb_build_object('ok', true, 'stored', v_rows > 0);
end $$;
revoke all on function public.kw_push_balance(text, date, numeric, jsonb) from public;
grant execute on function public.kw_push_balance(text, date, numeric, jsonb) to anon, authenticated;

-- 8. App-facing status --------------------------------------------------------------------
create or replace function public.acct_balance_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := auth.uid(); s record; v_job boolean := null;
begin
 if v_user is null then raise exception 'login required' using errcode = '28000'; end if;
 select * into s from public.acct_hl_state where user_id = v_user;
 begin select exists (select 1 from cron.job j where j.jobname = 'acct-balance' and j.active) into v_job;
 exception when others then v_job := null; end;
 return jsonb_build_object('cron_active', v_job,
  'hl_last_close_day', s.last_close_day, 'hl_last_error', s.last_error, 'hl_last_error_at', s.last_error_at,
  'hl_backfill_requested_at', s.backfill_requested_at, 'hl_backfill_done_at', s.backfill_done_at,
  'hl_backfill_days', s.backfill_days, 'hl_backfill_error', s.backfill_error,
  'hl_backfill_pending', exists (select 1 from public.acct_hl_batch b where b.user_id = v_user and b.purpose = 'backfill'),
  'hl_count', (select count(*) from public.acct_snapshots a where a.user_id = v_user and a.market = 'hl'),
  'us_count', (select count(*) from public.acct_snapshots a where a.user_id = v_user and a.market = 'us'));
end $$;
revoke all on function public.acct_balance_status() from public, anon;
grant execute on function public.acct_balance_status() to authenticated;

-- 9. Schedule (re-running replaces the job of the same name) --------------------------
select cron.schedule('acct-balance', '* * * * *', 'select public.acct_balance_tick()');
commit;

-- Check after running (optional):
--   select jobname, schedule, active from cron.job where jobname = 'acct-balance';
--   select market, day, value, source, captured_at from public.acct_snapshots order by day desc limit 10;
--   select * from public.acct_hl_state;
-- Fill past HL days once (approx):  select public.acct_hl_backfill_all();   (or the app button)
-- Stop:  select cron.unschedule('acct-balance');
