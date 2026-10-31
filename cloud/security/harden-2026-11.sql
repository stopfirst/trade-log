-- Trade Journal 보안 보강 2026-11 (AUDIT-2026-11.md 의 M1·L1·L2·L3 대응). Supabase SQL Editor 에서 통째로 실행.
-- 멱등: 몇 번 실행해도 결과가 같음. 데이터(행)는 읽지도 바꾸지도 않음 — 권한(GRANT)·RLS 스위치·기본 권한만 만짐.
-- 되돌리기: cloud/security/harden-2026-11-undo.sql (이 파일이 실제로 바꾼 것만 public._harden_2026_11_log 에 적어 두고 그대로 되돌림).
--
-- 하는 일
--  1. 앞으로 public 에 만들 함수·시퀀스·테이블의 "자동 공개" 끄기 (Supabase 기본값은 새 객체를 anon/authenticated 에 자동 GRANT).
--     → 이후 SQL 파일은 지금처럼 필요한 grant 를 명시해야 함(저장소의 모든 SQL 이 이미 그렇게 작성돼 있음).
--  2. public 시퀀스(identity 포함)의 anon/authenticated 권한 회수 — 앱은 시퀀스를 직접 쓰지 않음(모든 쓰기는 security definer 함수).
--  3. 앱 테이블 RLS 다시 확인(꺼져 있으면 켬). 정책은 건드리지 않음.
--  4. security definer 함수 허용 목록 밖의 함수가 anon/authenticated 에게 열려 있으면 회수, 로그인 전용 함수가 anon 에게 열려 있으면 anon 만 회수.
--  5. pg_net(net 스키마) 함수를 anon/authenticated 가 직접 못 부르게 회수 (cron 작업은 postgres 로 돌아서 영향 없음).
--  6. 마지막에 점검표(SELECT) 출력: RLS 꺼진 테이블, search_path 없는 security definer, anon 이 실행 가능한 security definer.
begin;

create table if not exists public._harden_2026_11_log (
 id bigint generated always as identity primary key,
 kind text not null,      -- seq_priv | func_revoke | net_schema | net_func | rls_enabled
 obj text not null,       -- regclass / regprocedure text / schema name
 role text,               -- anon | authenticated | public
 priv text,               -- privilege that was removed
 at timestamptz not null default now(),
 unique (kind, obj, role, priv)
);
alter table public._harden_2026_11_log enable row level security;
revoke all on public._harden_2026_11_log from public, anon, authenticated;

-- 1. default privileges for objects created later by postgres (the SQL Editor role)
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- PUBLIC 의 함수 실행 기본값은 스키마별이 아니라 전역이라 스키마 지정으로는 못 끔 → 전역(postgres 가 만드는 함수)에서 끔
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;

do $$
declare r record; v_role text; v_priv text;
 c_anon text[] := array['kw_push','kw_heartbeat','kw_push_balance','risk_status','risk_push','risk_day_data',
                        'quick_review_push','review_gaps','alert_status','backup_dump'];
 c_auth text[] := array['kw_status','kw_register_token','kw_revoke_token','kw_clear_snapshots','hl_status','hl_set_address',
                        'hl_clear_address','acct_hl_backfill','acct_balance_status','journal_cas','journal_restore'];
 c_tables text[] := array['journal_cloud','journal_cloud_history','kw_collector','kw_snapshots','risk_state','risk_days','risk_events',
                          'risk_flows','quick_reviews','hl_watch','hl_fills','hl_funding','hl_pending','acct_snapshots','acct_hl_state',
                          'acct_hl_batch','acct_hl_pending','backup_log'];
 t text;
begin
 -- 2. sequences: log each privilege anon/authenticated still has, then revoke it
 for r in select c.oid, c.oid::regclass::text as obj from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'S' and c.relname <> '_harden_2026_11_log_id_seq' loop
  foreach v_role in array array['anon','authenticated'] loop
   foreach v_priv in array array['usage','select','update'] loop
    if has_sequence_privilege(v_role, r.oid, v_priv) then
     execute format('revoke %s on sequence %s from %I', v_priv, r.obj, v_role);
     insert into public._harden_2026_11_log(kind, obj, role, priv) values ('seq_priv', r.obj, v_role, v_priv) on conflict do nothing;
    end if;
   end loop;
  end loop;
 end loop;

 -- 3. RLS on every app table that exists
 foreach t in array c_tables loop
  if to_regclass('public.' || t) is not null and not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
   execute format('alter table public.%I enable row level security', t);
   insert into public._harden_2026_11_log(kind, obj) values ('rls_enabled', 'public.' || t) on conflict do nothing;
  end if;
 end loop;

 -- 4. security definer functions in public
 for r in select p.oid, p.oid::regprocedure::text as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosecdef loop
  if r.proname = any(c_anon) then
   continue;                                   -- collector-token functions: anon is intended
  elsif r.proname = any(c_auth) then
   if has_function_privilege('anon', r.oid, 'execute') then
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    insert into public._harden_2026_11_log(kind, obj, role, priv) values ('func_revoke', r.sig, 'anon', 'execute') on conflict do nothing;
   end if;
  else
   foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role, r.oid, 'execute') then
     execute format('revoke execute on function %s from public, %I', r.sig, v_role);
     insert into public._harden_2026_11_log(kind, obj, role, priv) values ('func_revoke', r.sig, v_role, 'execute') on conflict do nothing;
    end if;
   end loop;
  end if;
 end loop;

 -- 5. pg_net: nobody but postgres needs net.http_* directly.
 --    net 객체는 supabase_admin 소유라 postgres 가 회수 못 하는 경우가 있음 → 실패해도 전체를 멈추지 않고 알림만, 실제로 빠진 권한만 기록.
 if to_regnamespace('net') is not null then
  foreach v_role in array array['anon','authenticated'] loop
   begin
    if has_schema_privilege(v_role, 'net', 'usage') then
     execute format('revoke usage on schema net from %I', v_role);
     if not has_schema_privilege(v_role, 'net', 'usage') then
      insert into public._harden_2026_11_log(kind, obj, role, priv) values ('net_schema', 'net', v_role, 'usage') on conflict do nothing;
     else raise notice 'net 스키마 usage 를 % 에서 회수하지 못함(다른 경로로 부여됨) — 점검표 참고', v_role; end if;
    end if;
    for r in select p.oid, p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' loop
     if has_function_privilege(v_role, r.oid, 'execute') then
      execute format('revoke execute on function %s from %I', r.sig, v_role);
      if not has_function_privilege(v_role, r.oid, 'execute') then
       insert into public._harden_2026_11_log(kind, obj, role, priv) values ('net_func', r.sig, v_role, 'execute') on conflict do nothing;
      end if;
     end if;
    end loop;
   exception when others then
    raise notice 'net 권한 변경 건너뜀(%): %', v_role, sqlerrm;
   end;
  end loop;
 end if;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
commit;

-- 6. 점검표 — 문제 없으면 'OK' 한 줄만 나옴.
select kind, obj from (
 select 'RLS 꺼진 public 테이블' kind, c.oid::regclass::text obj from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
 union all
 select 'search_path 없는 security definer', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')
 union all
 select 'anon 실행 가능 security definer (토큰 함수 허용 목록)', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
 union all
 select 'anon/authenticated 가 아직 net 스키마 usage 보유(회수 실패 — Supabase 지원 문의 또는 무시 가능: net 은 REST 로 노출되지 않음)', r
  from unnest(array['anon','authenticated']) r where to_regnamespace('net') is not null and has_schema_privilege(r, 'net', 'usage')
 union all
 select '이번 실행/이전 실행에서 바꾼 것: ' || l.kind, l.obj || coalesce(' · ' || l.role, '') from public._harden_2026_11_log l
) x
union all select 'OK', '점검 끝 (위 목록의 anon 함수 = 수집기 토큰 함수, 정상)'
order by 1, 2;
