-- 2本の20261001 migration適用後に実行。テスト書込みは末尾のrollbackで取り消す。
begin;
select set_config('test.owner',(select user_id::text from public.app_store_links where app_key='hidaka-order' and legacy_store_id='hidaka-001' limit 1),true);
select set_config('test.history','test-history-'||gen_random_uuid()::text,true);
select set_config('test.visit','test-visit-'||gen_random_uuid()::text,true);
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
set local role authenticated;
do $$
declare p jsonb; r jsonb; snapshot jsonb; ctx jsonb;
begin
  p:=jsonb_build_object('schema_version',1,'id',current_setting('test.history'),'visit_id',current_setting('test.visit'),
    'local_store_id','hidaka-001','visited_at',now(),'recorded_at',now(),
    'items',jsonb_build_array(jsonb_build_object('menu_id','unregistered-test','name','検証用串','category','skewer','source','manual','quantity',3,'unit_price',100)),
    'proposed_items','[]'::jsonb,'removed_items','[]'::jsonb,'feedback',null);
  r:=public.save_hidaka_order_history(p);
  perform public.save_hidaka_order_history(p);
  if (select count(*) from public.visits where user_id=auth.uid() and order_history_id=p->>'id') <> 1 then raise exception 'duplicate visit'; end if;
  select order_snapshot into snapshot from public.visits where user_id=auth.uid() and order_history_id=p->>'id';
  if snapshot->>'total_amount' <> '300' or snapshot->>'skewer_count' <> '3' then raise exception 'wrong amount/count'; end if;
  p:=p||jsonb_build_object('feedback',jsonb_build_object('satisfaction',5,'updatedAt',now()));
  perform public.save_hidaka_order_history(p);
  ctx:=public.get_hidaka_ai_context('hidaka-order','hidaka-001',20);
  if not exists(select 1 from jsonb_array_elements(ctx->'recent_orders') o where o->>'id'=p->>'id' and o#>>'{feedback,satisfaction}'='5') then raise exception 'direct history absent from AI context'; end if;
  begin
    perform public.save_hidaka_order_history(p,'hidaka-order','other-store');
    raise exception 'wrong store accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.visits where order_history_id=current_setting('test.history')) then raise exception 'other user can read'; end if;
  begin
    perform public.save_hidaka_order_history('{}'::jsonb);
    raise exception 'other user can save';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.save_hidaka_order_history('{}'::jsonb);
    raise exception 'anonymous can save';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Direct order tests passed; test writes rolled back' as result;
