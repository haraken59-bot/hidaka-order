-- 202610080001/2適用後に実行。検証用データは全てROLLBACK。実履歴の削除はしない。
begin;
select set_config('test.owner',(select user_id::text from public.app_store_links where app_key='hidaka-order' and legacy_store_id='hidaka-001' limit 1),true);
select set_config('test.history','test-history-'||gen_random_uuid()::text,true);
select set_config('test.visit','test-visit-'||gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare p jsonb; r jsonb; ctx jsonb; original jsonb; store uuid; run_id uuid:=gen_random_uuid(); h text:=current_setting('test.history'); v text:=current_setting('test.visit');
begin
  if auth.uid() is null then raise exception 'test owner missing'; end if;
  select store_id into store from public.app_store_links where user_id=auth.uid() and app_key='hidaka-order' and legacy_store_id='hidaka-001';
  p:=jsonb_build_object('schema_version',1,'id',h,'visit_id',v,'local_store_id','hidaka-001','visited_at',now(),'recorded_at',now(),
    'items',jsonb_build_array(jsonb_build_object('name','テスト串','category','skewer','source','legacy','quantity',5,'unit_price',100)),
    'proposed_items',jsonb_build_array(jsonb_build_object('name','最初の提案','quantity',5)), 'removed_items','[]'::jsonb,'feedback',null);
  original:=p->'proposed_items';
  perform public.save_hidaka_order_history(p);
  perform public.save_hidaka_order_history(p);
  perform public.save_hidaka_order_history(p||jsonb_build_object('id',h||'-control','visit_id',v||'-control'));
  insert into public.recommendation_runs(user_id,id,store_id,visit_id,algorithm_version) values(auth.uid(),run_id,store,v,'test');
  insert into public.recommendation_items(user_id,recommendation_run_id,menu_name,order_index) values(auth.uid(),run_id,'テスト提案',1);
  if (select count(*) from public.visits where user_id=auth.uid() and order_history_id=h)<>1 then raise exception 'duplicate'; end if;
  r:=public.list_hidaka_order_history(array[h]);
  if jsonb_array_length(r->'records')<>1 then raise exception 'inventory'; end if;
  p:=jsonb_set(p,'{items,0,quantity}','3') || jsonb_build_object('operation','edit','proposed_items','[]'::jsonb,'feedback',jsonb_build_object('satisfaction',5,'comment','テスト','updatedAt',now()));
  perform public.manage_hidaka_order_history(p);
  perform public.manage_hidaka_order_history(p);
  select order_snapshot into r from public.visits where user_id=auth.uid() and order_history_id=h;
  if r->'proposed_items'<>original or r->>'total_amount'<>'300' then raise exception 'edit proposal/total'; end if;
  if (select count(*) from public.order_items where user_id=auth.uid() and visit_id=v and deleted_at is null)<>1 then raise exception 'duplicate lines'; end if;
  if (select sum(subtotal) from public.order_items where user_id=auth.uid() and visit_id=v and deleted_at is null)<>300 then raise exception 'line total'; end if;
  -- import must not overwrite an existing order, even if sent again with old content.
  perform public.manage_hidaka_order_history(jsonb_set(p,'{items,0,quantity}','9')||jsonb_build_object('operation','import'));
  if (select total_amount from public.visits where user_id=auth.uid() and order_history_id=h)<>300 then raise exception 'import overwrite'; end if;
  ctx:=public.get_hidaka_ai_context('hidaka-order','hidaka-001',20);
  if not exists(select 1 from jsonb_array_elements(ctx->'recent_orders') o where o->>'id'=h and o->>'total_amount'='300') then raise exception 'edited AI context'; end if;
  -- Ensure an old backup cannot resurrect a soft-deleted visit. This fixture is rolled back.
  insert into public.hidaka_manual_backups(user_id,app_key,store_id,backup_id,payload)
  values(auth.uid(),'hidaka-order',store,gen_random_uuid(),jsonb_build_object('format','hidaka-order-full-backup','schemaVersion',6,
    'data',jsonb_build_object('menu','[]'::jsonb,'initialMenu','[]'::jsonb,'stores','[]'::jsonb,'preferences','{}'::jsonb,'pendingOrder',null,'outOfStock',jsonb_build_object('ids','[]'::jsonb),
      'history',jsonb_build_array(jsonb_build_object('id',h,'visitId',v,'date',current_date,'items','[]'::jsonb)))))
  on conflict(user_id,app_key,store_id) do update set payload=excluded.payload;
  perform public.manage_hidaka_order_history(p||jsonb_build_object('operation','delete'));
  perform public.manage_hidaka_order_history(p||jsonb_build_object('operation','delete'));
  if (select deleted_at from public.visits where user_id=auth.uid() and order_history_id=h) is null then raise exception 'visit deletion'; end if;
  if exists(select 1 from public.order_items where user_id=auth.uid() and visit_id=v and deleted_at is null) then raise exception 'line deletion'; end if;
  if exists(select 1 from public.visit_feedback where user_id=auth.uid() and visit_id=v and deleted_at is null) then raise exception 'feedback deletion'; end if;
  if exists(select 1 from public.recommendation_runs where user_id=auth.uid() and id=run_id and deleted_at is null) then raise exception 'run deletion'; end if;
  if exists(select 1 from public.recommendation_items where user_id=auth.uid() and recommendation_run_id=run_id and deleted_at is null) then raise exception 'proposal deletion'; end if;
  if not exists(select 1 from public.visits where user_id=auth.uid() and order_history_id=h||'-control' and deleted_at is null) then raise exception 'other history lost'; end if;
  ctx:=public.get_hidaka_ai_context('hidaka-order','hidaka-001',20);
  if exists(select 1 from jsonb_array_elements(ctx->'recent_orders') o where o->>'id'=h) then raise exception 'deleted backup resurrection'; end if;
  begin
    perform public.save_hidaka_order_history(p||jsonb_build_object('operation','save'));
    raise exception 'unexpected resurrection';
  exception when raise_exception then
    if sqlerrm<>'history is deleted' then raise; end if;
  end;
  p:=p||jsonb_build_object('id',h||'-old','visit_id',v||'-old','operation','import','proposed_items',null,'feedback',null,'known_total',null);
  p:=jsonb_set(p,'{items,0,unit_price}','null');
  perform public.manage_hidaka_order_history(p);
  if (select total_amount from public.visits where user_id=auth.uid() and order_history_id=h||'-old') is not null then raise exception 'invented legacy amount'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.visits where order_history_id=current_setting('test.history')) then raise exception 'other user read'; end if;
  begin
    perform public.list_hidaka_order_history(array[current_setting('test.history')]);
    raise exception 'other user store access';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.manage_hidaka_order_history('{}'); raise exception 'anonymous access';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'History management tests passed; all test writes rolled back' as result;
