-- Trade Journal alert18: 매일 복기 알림 '단타 제외' (trade-alert 2.14.0 · 앱 v121-scalp와 같은 판정).
-- Run in Supabase SQL Editor AFTER cloud.sql and kiwoom-collector.sql (alert2/11.sql as before). Safe to run again
-- (create or replace only; no table, no data change). Replaces review_gaps(text, date) from alert11.sql with version 12:
-- everything version 11 returned stays exactly the same, plus only what the app v121 'scalp' test needs:
--   per entry/fill : price (fills), fee, timestamp            → holding time (first entry ~ last exit) and realized P&L
--   per trade      : initialRisk (1R), acctAt, funding sum (HL), process, viol (saved violations non-empty — labels never leave),
--                    fillViol (a fill marked 'violation'), v99Why ('plan'|'strong'), dismiss (app v109 hidden auto-detect keys),
--                    srvViol (an entry the alert server logged as 'entry during trading stop' in risk_events = app v21Viol), date, src
--   settings       : v121Min (scalp minutes), v99Cool, v99MaxLoss, riskMax, openMax, account
-- Still no note text, no images, no chart drawings leave the database.
-- Not on harden's anon allow-list problem: review_gaps IS on the allow-list (security/harden-2026-11.sql), and create or replace keeps grants.
-- Without this file trade-alert 2.14.0 still sends the daily reminder exactly like 2.12/2.13 (scalps not excluded, one WARN in the log).
-- Undo (back to version 11): run alert11.sql again.
begin;
create or replace function public.review_gaps(p_token text, p_since date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kw_collector; v_j jsonb := '{}'::jsonb; r record; v_from text; v_ev jsonb := '[]'::jsonb;
begin
 c := public.kw_auth(p_token);
 if c.window_count > 60 then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
 if p_since is null or p_since < date '2020-01-01' or p_since > (now() at time zone 'UTC')::date + 2 then return jsonb_build_object('ok', false, 'error', 'bad_since'); end if;
 v_from := to_char(p_since - 40, 'YYYY-MM-DD');
 -- app v21: entries the alert server logged as 'violation' (new entry while trading was stopped), last 120 days like the app reads them
 if to_regclass('public.risk_events') is not null then
  select coalesce(jsonb_agg(jsonb_build_object('m', e.market, 'tid', e.detail->>'tid', 'sym', upper(coalesce(e.detail->>'symbol','')),
           'od', e.detail->>'orderDate',
           'et', case when (e.detail->>'t') ~ '^[0-9]{10,16}$' then to_char((to_timestamp((e.detail->>'t')::numeric / 1000) at time zone 'America/New_York'), 'YYYY-MM-DD') end)), '[]'::jsonb)
    into v_ev from (select market, detail from public.risk_events where user_id = c.user_id and kind = 'violation' and at >= now() - interval '120 days'
                    and jsonb_typeof(detail) = 'object' order by at desc limit 300) e;
 end if;
 for r in select scope, payload from public.journal_cloud where user_id = c.user_id and scope in ('US','HL') loop
  v_j := v_j || jsonb_build_object(r.scope, jsonb_build_object(
   'from', r.payload->'settings'->'v92From', 'minRR', r.payload->'settings'->'v92MinRR',
   'v121Min', r.payload->'settings'->'v121Min', 'v99Cool', r.payload->'settings'->'v99Cool', 'v99MaxLoss', r.payload->'settings'->'v99MaxLoss',
   'riskMax', r.payload->'settings'->'riskMax', 'openMax', r.payload->'settings'->'openMax', 'account', r.payload->'settings'->'account',
   'trades', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t->'id', 'name', t->'name', 'market', t->'market', 'direction', t->'direction', 'date', t->'date', 'src', t->'sync'->'source',
      'entries', coalesce((select jsonb_agg(jsonb_build_object('date', e->'date', 'time', e->'time', 'price', e->'price', 'shares', e->'shares', 'seq', e->'seq',
            'fee', e->'fee', 'timestamp', e->'timestamp'))
         from jsonb_array_elements(case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) e where jsonb_typeof(e)='object'), '[]'::jsonb),
      'fills', coalesce((select jsonb_agg(jsonb_build_object('date', f->'date', 'time', f->'time', 'shares', f->'shares', 'seq', f->'seq',
            'price', f->'price', 'fee', f->'fee', 'timestamp', f->'timestamp'))
         from jsonb_array_elements(case when jsonb_typeof(t->'fills')='array' then t->'fills' else '[]'::jsonb end) f where jsonb_typeof(f)='object'), '[]'::jsonb),
      'funding', case when r.scope = 'HL' then (select sum((x->>'amount')::numeric) from jsonb_array_elements(case when jsonb_typeof(t->'funding')='array' then t->'funding' else '[]'::jsonb end) x
            where jsonb_typeof(x)='object' and (x->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$') end,
      'stop0', t->'stop0', 'target', t->'riskPlan'->'target', 'planRR', t->'plan0'->'rr', 'hide', t->'v92Hide',
      'initialRisk', t->'initialRisk', 'acctAt', t->'acctAt', 'process', t->'process', 'v99Why', t->'v99Why',
      'viol', jsonb_typeof(t->'violations')='array' and jsonb_array_length(t->'violations') > 0,
      'fillViol', exists (select 1 from jsonb_array_elements(case when jsonb_typeof(t->'fills')='array' then t->'fills' else '[]'::jsonb end) f
            where jsonb_typeof(f)='object' and f->>'compliance' = 'violation'),
      'dismiss', case when jsonb_typeof(t->'v109Dismiss')='array' then (select coalesce(jsonb_agg(d), '[]'::jsonb) from jsonb_array_elements(t->'v109Dismiss') d where jsonb_typeof(d)='string') else '[]'::jsonb end,
      'srvViol', case when r.scope = 'HL' then exists (select 1 from jsonb_array_elements(v_ev) v, jsonb_array_elements(case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) e
                     where v->>'m' = 'hl' and jsonb_typeof(e)='object' and e->>'fillId' is not null and v->>'tid' = e->>'fillId')
                 when t->'sync'->>'source' = 'kiwoom' then exists (select 1 from jsonb_array_elements(v_ev) v where v->>'m' = 'us' and v->>'sym' = upper(coalesce(t->>'name','')) and v->>'od' = t->>'date')
                 else exists (select 1 from jsonb_array_elements(v_ev) v, jsonb_array_elements(case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) e
                     where v->>'m' = 'us' and jsonb_typeof(e)='object' and v->>'sym' = upper(coalesce(t->>'name','')) and v->>'et' = e->>'date') end,
      'rrTp', (select x->'tp' from jsonb_array_elements(case when jsonb_typeof(t->'chartNotes')='array' then t->'chartNotes' else '[]'::jsonb end) x
               where jsonb_typeof(x)='object' and x->>'kind'='rr' and (x->>'side'='short') = (t->>'direction'='short') limit 1),
      'entryNote', length(btrim(coalesce(t->>'entryNote',''))) > 0, 'stopNote', length(btrim(coalesce(t->>'stopNote',''))) > 0,
      'react', jsonb_typeof(t->'react')='boolean' and (t->>'react')::boolean, 'tfIn', t->'tfIn', 'tfOut', t->'tfOut'))
     from jsonb_array_elements(case when jsonb_typeof(r.payload->'trades')='array' then r.payload->'trades' else '[]'::jsonb end) t
     where jsonb_typeof(t)='object' and exists (select 1 from jsonb_array_elements(
        (case when jsonb_typeof(t->'entries')='array' then t->'entries' else '[]'::jsonb end) || (case when jsonb_typeof(t->'fills')='array' then t->'fills' else '[]'::jsonb end)) e
       where jsonb_typeof(e)='object' and e->>'date' >= v_from)), '[]'::jsonb)));
 end loop;
 return jsonb_build_object('ok', true, 'version', 12, 'journal', v_j);
end $$;
revoke all on function public.review_gaps(text, date) from public;
grant execute on function public.review_gaps(text, date) to anon, authenticated;
commit;
