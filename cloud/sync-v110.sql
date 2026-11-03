-- sync-v110 (선택) · 2026-11-03 · 앱 v110 자동 동기화용 클라우드 이력 보관 늘리기
-- 앱 v110 은 이 SQL 없이도 기존 journal_cloud / journal_cas 로 그대로 동작합니다.
-- 자동 동기화는 일지를 고칠 때마다(몇 초 모아) 클라우드에 저장하므로, 기존 '최근 5개만 보관' 이력은 몇 번의 편집만에 밀려납니다.
-- 이 SQL 은 이력 정리 규칙만 바꿉니다: 최근 5개 + 최근 48시간은 1시간마다 마지막 1개 + 최근 30일은 하루마다 마지막 1개 (최대 약 83개).
-- 테이블·컬럼·RLS 정책·권한은 바꾸지 않습니다(함수 본문만 교체, 같은 이름·인자·security definer·search_path).
-- 여러 번 실행해도 안전합니다. 되돌리기: cloud/cloud.sql 의 journal_archive_and_write 부분을 다시 실행.
begin;
create or replace function public.journal_archive_and_write(p_user uuid,p_scope text,p_old_revision bigint,p_old_payload jsonb,p_old_updated timestamptz,p_payload jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
 insert into public.journal_cloud_history(user_id,scope,revision,payload,trade_count,saved_at)
 values(p_user,p_scope,p_old_revision,p_old_payload,
  case when jsonb_typeof(p_old_payload->'trades')='array' then jsonb_array_length(p_old_payload->'trades') else 0 end,
  p_old_updated)
 on conflict(user_id,scope,revision) do nothing;
 update public.journal_cloud set payload=p_payload,revision=revision+1,updated_at=now()
 where user_id=p_user and scope=p_scope and revision=p_old_revision
 returning revision into v_revision;
 delete from public.journal_cloud_history h
 where h.user_id=p_user and h.scope=p_scope and h.id not in(
  select k.id from (
   select x.id,
    row_number() over(order by x.revision desc) as rn_all,
    row_number() over(partition by date_trunc('hour',x.saved_at) order by x.revision desc) as rn_hour,
    row_number() over(partition by date_trunc('day',x.saved_at) order by x.revision desc) as rn_day,
    x.saved_at
   from public.journal_cloud_history x where x.user_id=p_user and x.scope=p_scope) k
  where k.rn_all<=5
   or (k.rn_hour=1 and k.saved_at>now()-interval '48 hours')
   or (k.rn_day=1 and k.saved_at>now()-interval '30 days'));
 return v_revision;
end $$;
revoke all on function public.journal_archive_and_write(uuid,text,bigint,jsonb,timestamptz,jsonb) from public,anon,authenticated;
commit;
