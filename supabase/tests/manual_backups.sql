-- 専用テーブルのみ、仮データをトランザクション内で検証して全てROLLBACKする。
-- 既存データに対する更新/削除はない。migration適用後、SQL Editorで実行。
begin;
select set_config('hidaka_test.owner', (select user_id::text from public.app_store_links where app_key='hidaka-order' and legacy_store_id='hidaka-001' limit 1), true);
select set_config('hidaka_test.store', (select store_id::text from public.app_store_links where app_key='hidaka-order' and legacy_store_id='hidaka-001' limit 1), true);
do $$ begin
  if exists(select 1 from public.hidaka_manual_backups where user_id=current_setting('hidaka_test.owner')::uuid and app_key='hidaka-order' and store_id=current_setting('hidaka_test.store')::uuid) then
    raise exception '実バックアップが存在するため書込みテストを中止。新規の空の保存先でのみ実行する。';
  end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('hidaka_test.owner'), true);
set local role authenticated;
insert into public.hidaka_manual_backups(user_id,app_key,store_id,backup_id,payload)
values(auth.uid(),'hidaka-order',current_setting('hidaka_test.store')::uuid,gen_random_uuid(),
 '{"format":"hidaka-order-full-backup","schemaVersion":6,"data":{"menu":[],"initialMenu":[],"history":[],"stores":[],"preferences":{},"outOfStock":{"ids":[]},"pendingOrder":null}}');
insert into public.hidaka_manual_backups(user_id,app_key,store_id,backup_id,payload)
values(auth.uid(),'hidaka-order',current_setting('hidaka_test.store')::uuid,gen_random_uuid(),
 '{"format":"hidaka-order-full-backup","schemaVersion":6,"data":{"menu":[{"name":"test"}],"initialMenu":[],"history":[],"stores":[],"preferences":{},"outOfStock":{"ids":[]},"pendingOrder":null}}')
on conflict(user_id,app_key,store_id) do update set user_id=excluded.user_id,app_key=excluded.app_key,store_id=excluded.store_id,backup_id=excluded.backup_id,payload=excluded.payload;
do $$ begin
  if (select count(*) from public.hidaka_manual_backups) <> 1 or (select menu_count from public.hidaka_manual_backups) <> 1 then raise exception 'own read/upsert/count failed'; end if;
  if has_column_privilege('authenticated','public.hidaka_manual_backups','updated_at','UPDATE') then raise exception 'timestamp must be server controlled'; end if;
  begin
    delete from public.hidaka_manual_backups;
    raise exception 'delete unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.hidaka_manual_backups set user_id='00000000-0000-4000-8000-000000000002';
    raise exception 'owner reassignment unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.hidaka_manual_backups) <> 0 then raise exception 'other user can read backup'; end if;
  update public.hidaka_manual_backups set backup_id=gen_random_uuid();
  if found then raise exception 'other user can update backup'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.hidaka_manual_backups;
    raise exception 'anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'RLS and upsert tests passed; fixture rolled back' as result,
 (select count(*) from public.hidaka_manual_backups) as remaining_backups,
 (select count(*) from public.menu_items) as menus,
 (select count(*) from public.visits) as visits,
 (select count(*) from public.bottles) as bottles;
