-- 되돌리기: harden-2026-11.sql 이 바꾼 것만 원래대로 (public._harden_2026_11_log 기록 기준). Supabase SQL Editor 에서 통째로 실행.
-- 멱등. 데이터(행)는 건드리지 않음. 로그 테이블이 없으면(보강을 실행한 적 없으면) 기본 권한만 Supabase 기본값으로 돌리고 끝.
begin;

-- 1. 기본 권한 = Supabase 기본값(새 객체를 anon/authenticated 에 자동 GRANT)
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon;

do $$
declare r record;
begin
 if to_regclass('public._harden_2026_11_log') is null then return; end if;
 for r in select * from public._harden_2026_11_log order by id desc loop
  if r.kind = 'seq_priv' and to_regclass(r.obj) is not null then
   execute format('grant %s on sequence %s to %I', r.priv, r.obj, r.role);
  elsif r.kind = 'func_revoke' and to_regprocedure(r.obj) is not null then
   execute format('grant execute on function %s to %I', r.obj, r.role);
  elsif r.kind = 'net_schema' and to_regnamespace(r.obj) is not null then
   execute format('grant usage on schema %I to %I', r.obj, r.role);
  elsif r.kind = 'net_func' and to_regprocedure(r.obj) is not null then
   execute format('grant execute on function %s to %I', r.obj, r.role);
  end if;
  -- rls_enabled: 일부러 되돌리지 않음(RLS 를 끄면 정책 없는 테이블이 열림). 꼭 필요하면 직접: alter table <obj> disable row level security;
 end loop;
end $$;
drop table if exists public._harden_2026_11_log;
commit;
