-- Trade Journal alert21: 앱 v126 '새 출발' 기준 시각을 알림 서버가 읽게 (trade-alert 2.17.0).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql. Safe to run again (create or replace only; no table, no data change).
--
-- Adds ONE read-only function for the alert server (publishable key + collector token, like risk_status / mag_status):
--   fresh_status(p_token text) → {ok, version:1, journal:{US:{v126:{...}}, HL:{v126:{...}}}}
--   v126 = the app's journal_cloud payload.settings.v126 subset only: on, epoch, cutoff (ms), day, eq (account value at the fresh start),
--          carry (open-position trade ids carried over), at, undone. No trades, no notes, no archive (v126Archive never leaves the database).
-- Without this file trade-alert 2.17.0 behaves exactly like 2.16.0 (all fills count; one WARN in the log).
--
-- ORDER with security/harden-2026-11.sql: harden revokes anon EXECUTE from public functions not on its allow-list.
-- If you run harden AFTER this file, run this file once more (it re-grants execute on fresh_status to anon).
--
-- Undo: drop function if exists public.fresh_status(text);   (the server then logs one WARN and counts all fills again)
begin;
create or replace function public.fresh_status(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_j jsonb := '{}'::jsonb; r record; s jsonb;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 for r in select scope, payload from public.journal_cloud where user_id = c.user_id and scope in ('US','HL') loop
  s := r.payload->'settings'->'v126';
  if jsonb_typeof(s) = 'object' then
   v_j := v_j || jsonb_build_object(r.scope, jsonb_build_object('v126', jsonb_build_object(
     'on', case when jsonb_typeof(s->'on') = 'boolean' then s->'on' else 'false'::jsonb end,
     'epoch', case when jsonb_typeof(s->'epoch') = 'string' and length(s->>'epoch') <= 48 then s->'epoch' end,
     'cutoff', case when jsonb_typeof(s->'cutoff') = 'number' then s->'cutoff' end,
     'day', case when jsonb_typeof(s->'day') = 'string' and (s->>'day') ~ '^\d{4}-\d{2}-\d{2}$' then s->'day' end,
     'eq', case when jsonb_typeof(s->'eq') = 'number' then s->'eq' end,
     'at', case when jsonb_typeof(s->'at') = 'number' then s->'at' end,
     'undone', case when jsonb_typeof(s->'undone') = 'string' and length(s->>'undone') <= 48 then s->'undone' end,
     'carry', case when jsonb_typeof(s->'carry') = 'array' then (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(s->'carry') x where jsonb_typeof(x) = 'string' limit 50) q) else '[]'::jsonb end)));
  else
   v_j := v_j || jsonb_build_object(r.scope, jsonb_build_object('v126', null));
  end if;
 end loop;
 return jsonb_build_object('ok', true, 'version', 1, 'journal', v_j);
end $$;
revoke all on function public.fresh_status(text) from public;
grant execute on function public.fresh_status(text) to anon, authenticated;
commit;

-- Check after running (optional):
--   select scope, payload->'settings'->'v126' from public.journal_cloud;   -- 앱에서 새 출발한 일지만 값이 있음
