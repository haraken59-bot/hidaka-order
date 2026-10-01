-- 日高の注文記録のみ直接保存。キープ帖のテーブルには変更を加えない。
begin;
alter table public.visits add column if not exists order_snapshot jsonb;
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
  v_items := p_order->'items';
  if jsonb_array_length(v_items) < 1 or jsonb_array_length(v_items) > 200 then raise exception 'invalid item count'; end if;
  if jsonb_typeof(p_order->'removed_items') is distinct from 'array'
    or (p_order->'proposed_items' <> 'null'::jsonb and jsonb_typeof(p_order->'proposed_items') <> 'array')
    then raise exception 'invalid proposal'; end if;
  if exists(select 1 from jsonb_array_elements(v_items) i
    where coalesce(i->>'name','')='' or jsonb_typeof(i->'unit_price') is distinct from 'number'
      or (i->>'unit_price')::numeric < 0 or (i->>'unit_price')::numeric <> trunc((i->>'unit_price')::numeric)
      or jsonb_typeof(i->'quantity') is distinct from 'number' or (i->>'quantity')::numeric < 1
      or (i->>'quantity')::numeric <> trunc((i->>'quantity')::numeric)) then raise exception 'invalid order line'; end if;
  v_rating := (p_order #>> '{feedback,satisfaction}')::integer;
  if v_rating is not null and v_rating not between 1 and 5 then raise exception 'invalid satisfaction'; end if;
  select sum((i->>'unit_price')::integer * (i->>'quantity')::integer),
    coalesce(sum((i->>'quantity')::integer) filter (where i->>'category'<>'fee'),0),
    coalesce(sum((i->>'quantity')::integer) filter (where i->>'category'='skewer'),0)
    into v_total,v_count,v_skewers from jsonb_array_elements(v_items) i;
  v_snapshot := p_order || jsonb_build_object('user_id',v_user,'store_id',v_store,'store_name',v_name,
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
commit;
