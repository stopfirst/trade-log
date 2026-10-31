-- 읽기 전용 점검 (아무것도 바꾸지 않음). Supabase SQL Editor 에서 한 덩어리씩 실행해 결과를 보면 됨.
-- AUDIT-2026-11.md 의 "실DB에서 직접 확인할 것" 항목.

-- 1) public 테이블별 RLS 상태와 정책 (모두 rls=true, 정책은 user_id = auth.uid() 계열이어야 정상)
select c.relname as table, c.relrowsecurity as rls,
       coalesce(string_agg(p.polname || ' [' || case p.polcmd when 'r' then 'select' when 'w' then 'update' when 'a' then 'insert' when 'd' then 'delete' else 'all' end
        || '] ' || pg_get_expr(p.polqual, p.polrelid), E'\n'), '(정책 없음 = 함수로만 접근)') as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind in ('r','p') group by c.relname, c.relrowsecurity order by 1;

-- 2) anon / authenticated 가 가진 테이블 권한 (anon 은 0행이어야 정상, authenticated 는 select 위주 + quick_reviews update)
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) privs
from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')
group by 1, 2 order by 1, 2;

-- 3) security definer 함수: search_path 고정 여부와 anon/authenticated 실행 가능 여부
select p.oid::regprocedure as function, p.proconfig as config,
       has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef order by anon desc, authenticated desc, 1;

-- 4) pg_cron 작업과 최근 실행 결과 (hl-collector, acct-balance 2개가 정상)
select jobid, jobname, schedule, command, active from cron.job order by jobid;
select j.jobname, d.status, d.start_time, left(d.return_message, 120) msg from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 10;

-- 5) public 스키마 기본 권한 (Supabase 기본: anon/authenticated 에 자동 GRANT — harden-2026-11.sql 실행 후엔 함수·시퀀스 줄이 사라짐)
select pg_get_userbyid(d.defaclrole) as owner, coalesce(n.nspname, '(전역)') as schema,
       case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' when 'n' then 'schemas' end as objects,
       d.defaclacl as acl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace order by 1, 2, 3;

-- 6) Storage 버킷과 정책 (앱은 Storage 를 쓰지 않음 — 0행이면 정상)
select id, name, public from storage.buckets;
select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'storage.objects'::regclass;

-- 7) 백업 함수 설치·최근 호출 (alert13.sql 실행 후)
select proname from pg_proc where proname = 'backup_dump';
select user_id, day, day_count, last_at, last_part from public.backup_log;
