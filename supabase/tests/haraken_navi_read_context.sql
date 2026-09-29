-- ハラケンナビ用RPCの本人限定・読み取り専用テスト。
-- migration適用後、Supabase SQL Editorで実行する。データ変更は行わない。
begin;

select set_config(
  'hidaka_test.owner',
  (select user_id::text from public.app_store_links where app_key = 'hidaka-order' and legacy_store_id = 'hidaka-001' limit 1),
  true
);
select set_config(
  'hidaka_test.store',
  (select store_id::text from public.app_store_links where app_key = 'hidaka-order' and legacy_store_id = 'hidaka-001' limit 1),
  true
);
select set_config(
  'hidaka_test.counts',
  jsonb_build_object(
    'menu_items', (select count(*) from public.menu_items),
    'visits', (select count(*) from public.visits),
    'order_items', (select count(*) from public.order_items),
    'bottles', (select count(*) from public.bottles),
    'backups', (select count(*) from public.hidaka_manual_backups)
  )::text,
  true
);

select set_config('request.jwt.claim.sub', current_setting('hidaka_test.owner'), true);
set local role authenticated;

do $$
declare
  result jsonb;
begin
  result := public.get_hidaka_ai_context('hidaka-order', 'hidaka-001', 5);
  if result ->> 'schema_version' <> '1' then raise exception 'schema version mismatch'; end if;
  if result #>> '{store,id}' <> current_setting('hidaka_test.store') then raise exception 'store mismatch'; end if;
  if jsonb_typeof(result -> 'current_menu') <> 'array' then raise exception 'menu is not an array'; end if;
  if jsonb_typeof(result -> 'recent_orders') <> 'array' then raise exception 'orders is not an array'; end if;
  if jsonb_typeof(result -> 'order_summary') <> 'object' then raise exception 'summary is not an object'; end if;
  if jsonb_typeof(result #> '{bottle_status,bottles}') <> 'array' then raise exception 'bottles is not an array'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_hidaka_ai_context('hidaka-order', 'hidaka-001', 5);
    raise exception 'other user unexpectedly read data';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.get_hidaka_ai_context('hidaka-order', 'hidaka-001', 5);
    raise exception 'anonymous execution unexpectedly allowed';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
do $$
declare
  before_counts jsonb := current_setting('hidaka_test.counts')::jsonb;
  after_counts jsonb;
begin
  after_counts := jsonb_build_object(
    'menu_items', (select count(*) from public.menu_items),
    'visits', (select count(*) from public.visits),
    'order_items', (select count(*) from public.order_items),
    'bottles', (select count(*) from public.bottles),
    'backups', (select count(*) from public.hidaka_manual_backups)
  );
  if before_counts <> after_counts then raise exception 'read-only RPC changed table counts'; end if;
end;
$$;

rollback;
select 'Haraken Navi read-only RPC tests passed; no data changed' as result;
