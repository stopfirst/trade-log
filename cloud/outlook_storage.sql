-- v137 '아침 전망' 차트 이미지 저장소 (Supabase Storage)
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여 넣고 Run. 여러 번 실행해도 안전(멱등).
-- 만드는 것: 비공개 버킷 'outlook-images' + 로그인한 사용자가 "자기 폴더({user_id}/...)" 만 읽기·쓰기·고치기·지우기 하는 정책 4개.
-- 앱은 이미지를 {user_id}/{YYYY-MM-DD}/{uuid}.webp 경로로 올리고, 다른 기기에서는 signed URL 로 받아 봅니다.
-- 이 SQL 을 실행하기 전에도 앱은 동작합니다(이미지는 그 기기에만 저장 · '클라우드 대기' 표시 → 실행 뒤 자동으로 다시 올림).

-- 1) 버킷: 비공개, 파일 하나 최대 10MB, 이미지 형식만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outlook-images', 'outlook-images', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) 정책: 본인 폴더만 (경로 첫 칸 = 로그인 사용자 id)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'outlook_images_select_own') then
    create policy outlook_images_select_own on storage.objects
      for select to authenticated
      using (bucket_id = 'outlook-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'outlook_images_insert_own') then
    create policy outlook_images_insert_own on storage.objects
      for insert to authenticated
      with check (bucket_id = 'outlook-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'outlook_images_update_own') then
    create policy outlook_images_update_own on storage.objects
      for update to authenticated
      using (bucket_id = 'outlook-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'outlook-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'outlook_images_delete_own') then
    create policy outlook_images_delete_own on storage.objects
      for delete to authenticated
      using (bucket_id = 'outlook-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end
$$;

-- 확인(선택): 버킷 1줄 · 정책 4줄이 보이면 끝
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'outlook-images';
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'outlook_images_%' order by policyname;
