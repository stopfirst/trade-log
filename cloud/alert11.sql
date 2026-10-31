-- Trade Journal alert11: 매일 복기 알림용 일지 빈 칸 조회 (trade-alert 2.8.0 · 앱 v92).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql. Safe to run again (create or replace only; no table, no data change).
-- review_gaps(token, since) : read-only. Returns, for the token owner's US/HL journals, the trades with any entry/fill on or after
--   (since − 40 days), reduced to what the reminder needs: name, direction, entry/fill dates·prices·shares, stop0, target,
--   plan0.rr, and whether entry reason / stop reason are written, plus react / tfIn / tfOut and settings v92From / v92MinRR.
--   No note text, no images, no chart drawings leave the database (only the long/short R-tool target price).
-- Publishable key + collector token "kwc_..." (same kw_auth check and shared 60 calls/minute limit). No service_role key.
-- Undo: drop function public.review_gaps(text, date);
begin;
create or replace function public.review_gaps(p_token text, p_since date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_j jsonb := '{}'::jsonb; r record; v_from text;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_since is null or p_since < date '2020-01-01' or p_since > (now() at time zone 'UTC')::date + 2 then return jsonb_build_object('ok', false, 'error', 'bad_since'); end if;
 v_from := to_char(p_since - 40, 'YYYY-MM-DD');
 for r in select scope, payload from public.journal_cloud where user_id = c.user_id and scope in ('US','HL') loop
  v_j := v_j || jsonb_build_object(r.scope, jsonb_build_object(
   'from', r.payload->'settings'->'v92From', 'minRR', r.payload->'settings'->'v92MinRR',
   'trades', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t->'id', 'name', t->'name', 'market', t->'market', 'direction', t->'direction',
      'entries', coalesce((select jsonb_agg(jsonb_build_object('date', e->'date', 'time', e->'time', 'price', e->'price', 'shares', e->'shares', 'seq', e->'seq'))
         from jsonb_array_elements(case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) e where jsonb_typeof(e)='object'), '[]'::jsonb),
      'fills', coalesce((select jsonb_agg(jsonb_build_object('date', f->'date', 'time', f->'time', 'shares', f->'shares', 'seq', f->'seq'))
         from jsonb_array_elements(case when jsonb_typeof(t->'fills')='array' then t->'fills' else '[]'::jsonb end) f where jsonb_typeof(f)='object'), '[]'::jsonb),
      'stop0', t->'stop0', 'target', t->'riskPlan'->'target', 'planRR', t->'plan0'->'rr',
      'rrTp', (select x->'tp' from jsonb_array_elements(case when jsonb_typeof(t->'chartNotes')='array' then t->'chartNotes' else '[]'::jsonb end) x
               where jsonb_typeof(x)='object' and x->>'kind'='rr' and (x->>'side'='short') = (t->>'direction'='short') limit 1),
      'entryNote', length(btrim(coalesce(t->>'entryNote',''))) > 0, 'stopNote', length(btrim(coalesce(t->>'stopNote',''))) > 0,
      'react', jsonb_typeof(t->'react')='boolean' and (t->>'react')::boolean, 'tfIn', t->'tfIn', 'tfOut', t->'tfOut'))
     from jsonb_array_elements(case when jsonb_typeof(r.payload->'trades')='array' then r.payload->'trades' else '[]'::jsonb end) t
     where jsonb_typeof(t)='object' and exists (select 1 from jsonb_array_elements(
        (case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) || (case when jsonb_typeof(t->'fills')='array' then t->'fills' else '[]'::jsonb end)) e
       where jsonb_typeof(e)='object' and e->>'date' >= v_from)), '[]'::jsonb)));
 end loop;
 return jsonb_build_object('ok', true, 'version', 11, 'journal', v_j);
end $$;
revoke all on function public.review_gaps(text, date) from public;
grant execute on function public.review_gaps(text, date) to anon, authenticated;
commit;
