-- Supabase SQL Editor用。読み取り専用。データの変更・削除は行いません。
begin transaction read only;
select jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(c)) from (
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns where table_schema='public'
    and table_name in ('visits','order_items','recommendation_runs','recommendation_items','visit_feedback')
    order by table_name, ordinal_position) c),
  'constraints', (select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text,
    'name', conname, 'definition', pg_get_constraintdef(oid))) from pg_constraint
    where conrelid in ('public.visits'::regclass,'public.order_items'::regclass,
      'public.recommendation_runs'::regclass,'public.recommendation_items'::regclass,'public.visit_feedback'::regclass)),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'
    and tablename in ('visits','order_items','recommendation_runs','recommendation_items','visit_feedback')),
  'rls', (select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('visits','order_items','recommendation_runs','recommendation_items','visit_feedback')),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('save_hidaka_order_history','get_hidaka_ai_context')),
  'test_record', (select coalesce(jsonb_agg(jsonb_build_object(
    'visit_id',v.id,'order_history_id',v.order_history_id,
    'japan_date',(v.visited_at at time zone 'Asia/Tokyo')::date,
    'total_amount',v.total_amount,'deleted_at',v.deleted_at,
    'snapshot_item_count',v.order_snapshot->'item_count',
    'snapshot_line_count',case when jsonb_typeof(v.order_snapshot->'items')='array'
      then jsonb_array_length(v.order_snapshot->'items') else null end,
    'order_items',(select count(*) from public.order_items i where i.user_id=v.user_id and i.visit_id=v.id),
    'recommendation_runs',(select count(*) from public.recommendation_runs r where r.user_id=v.user_id and r.visit_id=v.id),
    'recommendation_items',(select count(*) from public.recommendation_items i join public.recommendation_runs r
      on r.user_id=i.user_id and r.id=i.recommendation_run_id where r.user_id=v.user_id and r.visit_id=v.id),
    'visit_feedback',(select count(*) from public.visit_feedback f where f.user_id=v.user_id and f.visit_id=v.id)
  )),'[]'::jsonb) from public.visits v where v.id='visit-1791353394301-a575b551eb749'
    or v.order_history_id='history-1791353394301-4b9ee277529c6')
) as history_management_preflight;
commit;
