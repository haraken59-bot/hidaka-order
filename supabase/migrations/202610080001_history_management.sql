-- 日高の注文記録のみ直接保存。キープ帖のテーブルには変更を加えない。
begin;
alter table public.visits add column if not exists order_snapshot jsonb;
alter table public.recommendation_runs add column if not exists deleted_at timestamptz;
alter table public.recommendation_items add column if not exists deleted_at timestamptz;
alter table public.visit_feedback add column if not exists deleted_at timestamptz;
comment on column public.visits.order_snapshot is '日高の確定注文。提案・実注文・除外・感想の保存時スナップショット';
create or replace function public.save_hidaka_order_history(
  p_order jsonb, p_app_key text default 'hidaka-order', p_legacy_store_id text default 'hidaka-001'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_store uuid;
  v_name text;
  v_items jsonb;
  v_snapshot jsonb;
  v_existing public.visits%rowtype;
  v_total integer;
  v_count integer;
  v_skewers integer;
  v_rating integer;
  v_operation text := coalesce(p_order->>'operation','save');
  v_line jsonb;
  v_index integer;
  v_line_id text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  select s.id, s.name into v_store, v_name
    from public.app_store_links l join public.stores s on s.user_id=l.user_id and s.id=l.store_id
    where l.user_id=v_user and l.app_key=p_app_key and l.legacy_store_id=p_legacy_store_id;
  if v_store is null then raise exception 'store link not found' using errcode='42501'; end if;
  if p_order is null or jsonb_typeof(p_order) <> 'object'
    or p_order->>'schema_version' is distinct from '1'
    or p_order->>'local_store_id' is distinct from p_legacy_store_id
    or coalesce(p_order->>'id','') = '' or coalesce(p_order->>'visit_id','') = ''
    or octet_length(p_order::text) > 500000
    or jsonb_typeof(p_order->'items') is distinct from 'array'
    then raise exception 'invalid order' using errcode='22023'; end if;
  if v_operation not in ('save','edit','delete','import') then raise exception 'invalid operation'; end if;
  -- A tombstone is also created for local-only records to suppress old backup copies.
  if v_operation='delete' then
    insert into public.visits(user_id,id,order_history_id,store_id,visited_at,recorded_at,deleted_at)
    values(v_user,p_order->>'visit_id',p_order->>'id',v_store,
      (p_order->>'visited_at')::timestamptz,(p_order->>'recorded_at')::timestamptz,now())
    on conflict(user_id,order_history_id) do nothing;
    select * into v_existing from public.visits where user_id=v_user and order_history_id=p_order->>'id' for update;
    if v_existing.store_id is distinct from v_store or v_existing.id is distinct from p_order->>'visit_id'
      then raise exception 'history identity mismatch' using errcode='42501'; end if;
    update public.visits set deleted_at=coalesce(deleted_at,now()) where user_id=v_user and id=v_existing.id;
    update public.order_items set deleted_at=coalesce(deleted_at,now()) where user_id=v_user and visit_id=v_existing.id;
    update public.recommendation_items set deleted_at=coalesce(deleted_at,now()) where user_id=v_user
      and recommendation_run_id in (select id from public.recommendation_runs where user_id=v_user and visit_id=v_existing.id);
    update public.recommendation_runs set deleted_at=coalesce(deleted_at,now()) where user_id=v_user and visit_id=v_existing.id;
    update public.visit_feedback set deleted_at=coalesce(deleted_at,now()) where user_id=v_user and visit_id=v_existing.id;
    return jsonb_build_object('id',p_order->>'id','user_id',v_user,'saved_at',now(),'deleted',true);
  end if;
  v_items := p_order->'items';
  if jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 200 then raise exception 'invalid item count'; end if;
  if jsonb_typeof(p_order->'removed_items') is distinct from 'array'
    or (p_order->'proposed_items' <> 'null'::jsonb and jsonb_typeof(p_order->'proposed_items') <> 'array')
    then raise exception 'invalid proposal'; end if;
  if exists(select 1 from jsonb_array_elements(v_items) i
    where coalesce(i->>'name','')='' or (jsonb_typeof(i->'unit_price') is distinct from 'number' and not (v_operation in ('save','import') and (i->'unit_price' is null or i->'unit_price'='null'::jsonb)))
      or (i->>'unit_price')::numeric < 0 or (i->>'unit_price')::numeric <> trunc((i->>'unit_price')::numeric)
      or jsonb_typeof(i->'quantity') is distinct from 'number' or (i->>'quantity')::numeric < 1
      or (i->>'quantity')::numeric <> trunc((i->>'quantity')::numeric)) then raise exception 'invalid order line'; end if;
  v_rating := (p_order #>> '{feedback,satisfaction}')::integer;
  if v_rating is not null and v_rating not between 1 and 5 then raise exception 'invalid satisfaction'; end if;
  select sum((i->>'unit_price')::integer * (i->>'quantity')::integer),
    coalesce(sum((i->>'quantity')::integer) filter (where i->>'category'<>'fee'),0),
    coalesce(sum((i->>'quantity')::integer) filter (where i->>'category'='skewer'),0)
    into v_total,v_count,v_skewers from jsonb_array_elements(v_items) i;
  if exists(select 1 from jsonb_array_elements(v_items) i where i->>'unit_price' is null) then
    v_total := (p_order->>'known_total')::integer;
    if v_total < 0 then raise exception 'invalid known total'; end if;
  end if;
  v_snapshot := (p_order - 'operation') || jsonb_build_object('user_id',v_user,'store_id',v_store,'store_name',v_name,
    'total_amount',v_total,'item_count',v_count,'skewer_count',v_skewers,
    'drinks',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(v_items) i where i->>'category'='drink'),
    'skewers',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(v_items) i where i->>'category'='skewer'),
    'snacks',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(v_items) i where i->>'category'='small'),
    'manual_items',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(v_items) i where i->>'source'='manual'),
    'changed_items',(select coalesce(jsonb_agg(i),'[]') from jsonb_array_elements(v_items) i where i->>'source'='changed'));
  -- The owner/history unique key makes retries idempotent. Existing order contents stay immutable.
  insert into public.visits(user_id,id,order_history_id,store_id,visited_at,recorded_at,total_amount,order_snapshot)
    values(v_user,p_order->>'visit_id',p_order->>'id',v_store,
      (p_order->>'visited_at')::timestamptz,(p_order->>'recorded_at')::timestamptz,v_total,v_snapshot)
    on conflict (user_id,order_history_id) do nothing;
  select * into v_existing from public.visits
    where user_id=v_user and order_history_id=p_order->>'id' for update;
  if v_existing.store_id is distinct from v_store or v_existing.id is distinct from p_order->>'visit_id'
    then raise exception 'history identity mismatch' using errcode='42501'; end if;
  if v_existing.deleted_at is not null then raise exception 'history is deleted'; end if;
  if v_operation='import' and v_existing.order_snapshot is distinct from v_snapshot then
    return jsonb_build_object('id',p_order->>'id','user_id',v_user,'saved_at',v_existing.updated_at,'already_exists',true);
  end if;
  if v_operation='edit' then
    -- Original proposal is immutable; only actual order/feedback is replaced.
    if v_existing.order_snapshot is not null then
      v_snapshot := v_snapshot || jsonb_build_object(
        'proposed_items',v_existing.order_snapshot->'proposed_items',
        'included_featured_dish',v_existing.order_snapshot->'included_featured_dish');
    end if;
    update public.visits set order_snapshot=v_snapshot,total_amount=v_total where user_id=v_user and id=v_existing.id;
    update public.order_items set deleted_at=coalesce(deleted_at,now()) where user_id=v_user and visit_id=v_existing.id;
    for v_line,v_index in select value,ordinality::integer from jsonb_array_elements(v_items) with ordinality loop
      v_line_id := 'hidaka:' || v_existing.id || ':line:' || v_index;
      if exists(select 1 from public.order_items where user_id=v_user and id=v_line_id and visit_id<>v_existing.id)
        then raise exception 'line identity mismatch'; end if;
      insert into public.order_items(user_id,id,visit_id,menu_id,menu_name,order_index,quantity,unit_price,subtotal,source,change_reason)
      values(v_user,v_line_id,v_existing.id,
        (select id from public.menu_items where user_id=v_user and store_id=v_store and id=v_line->>'menu_id'),
        v_line->>'name',v_index,(v_line->>'quantity')::integer,(v_line->>'unit_price')::integer,
        (v_line->>'quantity')::integer*(v_line->>'unit_price')::integer,coalesce(v_line->>'source','legacy'),coalesce(v_line->>'change_reason',''))
      on conflict(user_id,id) do update set menu_id=excluded.menu_id,menu_name=excluded.menu_name,order_index=excluded.order_index,
        quantity=excluded.quantity,unit_price=excluded.unit_price,subtotal=excluded.subtotal,source=excluded.source,
        change_reason=excluded.change_reason,deleted_at=null;
    end loop;
    insert into public.visit_feedback(user_id,visit_id,satisfaction,comment)
      values(v_user,v_existing.id,v_rating,coalesce(p_order #>> '{feedback,comment}',''))
      on conflict(user_id,visit_id) do update set satisfaction=excluded.satisfaction,comment=excluded.comment,deleted_at=null;
  end if;
  -- Imported legacy visits can acquire a snapshot only through explicit record/feedback save.
  update public.visits set order_snapshot = case when order_snapshot is null then v_snapshot
      when coalesce((p_order #>> '{feedback,updatedAt}')::timestamptz,'-infinity') >=
           coalesce((order_snapshot #>> '{feedback,updatedAt}')::timestamptz,'-infinity')
      then jsonb_set(order_snapshot,'{feedback}',coalesce(p_order->'feedback','null'::jsonb))
      else order_snapshot end
    where user_id=v_user and id=v_existing.id;
  return jsonb_build_object('id',p_order->>'id','user_id',v_user,'saved_at',now());
end;
$$;
revoke all on function public.save_hidaka_order_history(jsonb,text,text) from public,anon;
grant execute on function public.save_hidaka_order_history(jsonb,text,text) to authenticated;

create or replace function public.manage_hidaka_order_history(
 p_order jsonb,p_app_key text default 'hidaka-order',p_legacy_store_id text default 'hidaka-001'
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(p_order->>'operation','') not in ('edit','delete','import') then raise exception 'invalid management operation'; end if;
 return public.save_hidaka_order_history(p_order,p_app_key,p_legacy_store_id);
end;
$$;
revoke all on function public.manage_hidaka_order_history(jsonb,text,text) from public,anon;
grant execute on function public.manage_hidaka_order_history(jsonb,text,text) to authenticated;

create or replace function public.list_hidaka_order_history(
 p_ids text[],p_app_key text default 'hidaka-order',p_legacy_store_id text default 'hidaka-001'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_store uuid; v_records jsonb;
begin
 if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
 if coalesce(cardinality(p_ids),0)>100 then raise exception 'too many IDs'; end if;
 select store_id into v_store from public.app_store_links where user_id=v_user and app_key=p_app_key and legacy_store_id=p_legacy_store_id;
 if v_store is null then raise exception 'store link not found' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',order_history_id,'visit_id',id,'deleted_at',deleted_at)),'[]')
 into v_records from public.visits where user_id=v_user and store_id=v_store and order_history_id=any(p_ids);
 return jsonb_build_object('user_id',v_user,'records',v_records);
end;
$$;
revoke all on function public.list_hidaka_order_history(text[],text,text) from public,anon;
grant execute on function public.list_hidaka_order_history(text[],text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
