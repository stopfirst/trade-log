-- Trade Journal alert13: 일일 서버 백업용 읽기 전용 덤프 (trade-alert 2.9.0 · trade-alert-backup.timer).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql (alert2/5/9.sql, hl-collector.sql,
-- balance-snapshot.sql are optional — tables that are not installed are simply skipped).
-- Safe to run again (create ... if not exists / create or replace / drop policy if exists only; no data is changed or dropped).
--
-- backup_dump(token, part, scope, after) — publishable key + collector token "kwc_..." (same kw_auth sha256 lookup and
-- shared 60 calls/minute limit as kw_push / risk_push / review_gaps). Called once a day by the Lightsail backup timer.
--  * Only the token owner's rows. Nothing is written except the rate-limit counters (kw_collector via kw_auth, backup_log).
--  * kw_collector (token hash) is NEVER returned. auth.* is never touched.
--  * Extra daily cap: 400 calls per user per UTC day (a normal backup uses ~5–15 calls).
--  * NOTE (security trade-off): with this function the collector token can READ the full journal (notes and photos),
--    not only the compact fields alert/review_gaps return. The token stays only on your server (.env 0640 root:tradealert).
--    If the token ever leaks: app → 설정 → 키움 수집 토큰 다시 만들기 (old token is revoked at once), or run the undo below.
-- parts
--   'meta'            : versions, journal revisions/sizes, row counts — tiny
--   'journal'  scope  : journal_cloud row (US|HL) incl. full payload (photos are inside payload as data: URLs)
--   'history'  scope  : journal_cloud_history index (id, revision, saved_at, trade_count, bytes) — no payloads
--   'server'          : risk_state, risk_days, risk_events, risk_flows, acct_snapshots, quick_reviews, hl_watch (own rows)
--   'kw_snapshots' after=seq : 60 rows per page, ordered by seq
--   'hl_fills'     after=id  : 2000 rows per page (address registered in hl_watch), ordered by id
--   'hl_funding'   after=id  : 2000 rows per page
--   Each paged part returns {rows, next} — next = null when done.
-- Undo:  drop function if exists public.backup_dump(text, text, text, bigint); drop table if exists public.backup_log;
begin;

create table if not exists public.backup_log (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null default (now() at time zone 'UTC')::date,
 day_count integer not null default 0,
 last_at timestamptz,
 last_part text
);
alter table public.backup_log enable row level security;
revoke all on public.backup_log from public, anon, authenticated;
grant select on public.backup_log to authenticated;
drop policy if exists backup_log_own_select on public.backup_log;
create policy backup_log_own_select on public.backup_log for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.backup_dump(p_token text, p_part text, p_scope text default null, p_after bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_n int; v_after bigint := greatest(coalesce(p_after, 0), 0);
 v_addr text; v_rows jsonb; v_next bigint; v_out jsonb; v_today date := (now() at time zone 'UTC')::date;
begin
 c := public.kw_auth(p_token); -- raises 'invalid collector token' for unknown/malformed tokens
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_part is null or p_part not in ('meta','journal','history','server','kw_snapshots','hl_fills','hl_funding') then
  return jsonb_build_object('ok', false, 'error', 'bad_part');
 end if;
 if p_part in ('journal','history') and (p_scope is null or p_scope not in ('US','HL')) then
  return jsonb_build_object('ok', false, 'error', 'bad_scope');
 end if;
 insert into public.backup_log as b (user_id, day, day_count, last_at, last_part) values (c.user_id, v_today, 1, now(), p_part)
 on conflict (user_id) do update set
  day_count = case when b.day = v_today then b.day_count + 1 else 1 end,
  day = v_today, last_at = now(), last_part = excluded.last_part
 returning day_count into v_n;
 if v_n > 400 then return jsonb_build_object('ok', false, 'error', 'daily_limit'); end if;

 if to_regclass('public.hl_watch') is not null then
  select w.address into v_addr from public.hl_watch w where w.user_id = c.user_id;
 end if;

 if p_part = 'meta' then
  v_out := jsonb_build_object(
   'journals', coalesce((select jsonb_agg(jsonb_build_object('scope', j.scope, 'revision', j.revision, 'updated_at', j.updated_at,
       'bytes', octet_length(j.payload::text),
       'trades', case when jsonb_typeof(j.payload->'trades') = 'array' then jsonb_array_length(j.payload->'trades') else 0 end) order by j.scope)
     from public.journal_cloud j where j.user_id = c.user_id), '[]'::jsonb),
   'history_versions', (select count(*) from public.journal_cloud_history h where h.user_id = c.user_id),
   'kw_snapshots', (select count(*) from public.kw_snapshots s where s.user_id = c.user_id),
   'hl_address', v_addr,
   'tables', jsonb_build_object(
     'risk', to_regclass('public.risk_state') is not null,
     'acct_snapshots', to_regclass('public.acct_snapshots') is not null,
     'quick_reviews', to_regclass('public.quick_reviews') is not null,
     'hl', to_regclass('public.hl_fills') is not null and to_regclass('public.hl_funding') is not null));
  if v_addr is not null then
   v_out := v_out || jsonb_build_object(
    'hl_fills', (select count(*) from public.hl_fills f where f.address = v_addr),
    'hl_funding', (select count(*) from public.hl_funding f where f.address = v_addr));
  end if;

 elsif p_part = 'journal' then
  select jsonb_build_object('scope', j.scope, 'revision', j.revision, 'updated_at', j.updated_at, 'payload', j.payload)
   into v_out from public.journal_cloud j where j.user_id = c.user_id and j.scope = p_scope;
  v_out := jsonb_build_object('journal', v_out); -- null when this market has no cloud journal

 elsif p_part = 'history' then
  v_out := jsonb_build_object('history', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'revision', h.revision,
     'saved_at', h.saved_at, 'archived_at', h.archived_at, 'trade_count', h.trade_count, 'bytes', octet_length(h.payload::text)) order by h.revision desc)
   from public.journal_cloud_history h where h.user_id = c.user_id and h.scope = p_scope), '[]'::jsonb));

 elsif p_part = 'server' then
  v_out := jsonb_build_object('tables', jsonb_build_object());
  if to_regclass('public.risk_state') is not null then
   v_out := jsonb_set(v_out, '{tables}', (v_out->'tables') || jsonb_build_object(
    'risk_state', coalesce((select jsonb_agg(to_jsonb(t) order by t.market) from public.risk_state t where t.user_id = c.user_id), '[]'::jsonb),
    'risk_days', coalesce((select jsonb_agg(to_jsonb(t) order by t.market, t.day) from public.risk_days t where t.user_id = c.user_id), '[]'::jsonb),
    'risk_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.at, t.ref) from public.risk_events t where t.user_id = c.user_id), '[]'::jsonb),
    'risk_flows', coalesce((select jsonb_agg(to_jsonb(t) order by t.at, t.ref) from public.risk_flows t where t.user_id = c.user_id), '[]'::jsonb)));
  end if;
  if to_regclass('public.acct_snapshots') is not null then
   v_out := jsonb_set(v_out, '{tables}', (v_out->'tables') || jsonb_build_object(
    'acct_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.market, t.day) from public.acct_snapshots t where t.user_id = c.user_id), '[]'::jsonb)));
  end if;
  if to_regclass('public.quick_reviews') is not null then
   v_out := jsonb_set(v_out, '{tables}', (v_out->'tables') || jsonb_build_object(
    'quick_reviews', coalesce((select jsonb_agg(to_jsonb(t) order by t.answered_at, t.ref) from public.quick_reviews t where t.user_id = c.user_id), '[]'::jsonb)));
  end if;
  if to_regclass('public.hl_watch') is not null then
   v_out := jsonb_set(v_out, '{tables}', (v_out->'tables') || jsonb_build_object(
    'hl_watch', coalesce((select jsonb_agg(to_jsonb(t)) from public.hl_watch t where t.user_id = c.user_id), '[]'::jsonb)));
  end if;

 elsif p_part = 'kw_snapshots' then
  select coalesce(jsonb_agg(to_jsonb(s) order by s.seq), '[]'::jsonb), max(s.seq), count(*) into v_rows, v_next, v_n
   from (select * from public.kw_snapshots k where k.user_id = c.user_id and k.seq > v_after order by k.seq limit 60) s;
  v_out := jsonb_build_object('rows', v_rows, 'next', case when v_n = 60 then v_next end);

 elsif p_part in ('hl_fills','hl_funding') then
  if v_addr is null or to_regclass('public.hl_fills') is null or to_regclass('public.hl_funding') is null then
   v_out := jsonb_build_object('rows', '[]'::jsonb, 'next', null);
  elsif p_part = 'hl_fills' then
   select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]'::jsonb), max(f.id), count(*) into v_rows, v_next, v_n
    from (select * from public.hl_fills x where x.address = v_addr and x.id > v_after order by x.id limit 2000) f;
   v_out := jsonb_build_object('rows', v_rows, 'next', case when v_n = 2000 then v_next end);
  else
   select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]'::jsonb), max(f.id), count(*) into v_rows, v_next, v_n
    from (select * from public.hl_funding x where x.address = v_addr and x.id > v_after order by x.id limit 2000) f;
   v_out := jsonb_build_object('rows', v_rows, 'next', case when v_n = 2000 then v_next end);
  end if;
 end if;

 return jsonb_build_object('ok', true, 'version', 13, 'part', p_part, 'scope', p_scope, 'user_id', c.user_id,
  'now', (extract(epoch from now()) * 1000)::bigint) || v_out;
end $$;
revoke all on function public.backup_dump(text, text, text, bigint) from public;
grant execute on function public.backup_dump(text, text, text, bigint) to anon, authenticated;
commit;

-- Check after running (optional):
--   select proname from pg_proc where proname = 'backup_dump';
--   select * from public.backup_log;      -- last backup call per user
