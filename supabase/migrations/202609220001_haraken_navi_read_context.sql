-- ハラケンナビ連携準備: 本人限定・読み取り専用コンテキスト
-- 既存テーブルへ書き込まず、最新の手動バックアップを優先してJSONを返す。
-- 手動バックアップがない場合だけ、正規化済みテーブルを参照する。

begin;

create or replace function public.get_hidaka_ai_context(
  p_app_key text default 'hidaka-order',
  p_legacy_store_id text default 'hidaka-001',
  p_recent_limit integer default 5
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_store_id uuid;
  v_store jsonb;
  v_backup jsonb;
  v_backup_updated_at timestamptz;
  v_data_source text;
  v_menu jsonb := '[]'::jsonb;
  v_recent_orders jsonb := '[]'::jsonb;
  v_order_summary jsonb := '{}'::jsonb;
  v_bottle_status jsonb := '{}'::jsonb;
  v_stock_date date;
  v_stock_ids jsonb := '[]'::jsonb;
  v_fixed_charge integer := 220;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_recent_limit < 1 or p_recent_limit > 20 then
    raise exception 'p_recent_limit must be between 1 and 20' using errcode = '22023';
  end if;

  select link.store_id
    into v_store_id
  from public.app_store_links link
  where link.user_id = v_user_id
    and link.app_key = p_app_key
    and link.legacy_store_id = p_legacy_store_id
  limit 1;

  if v_store_id is null then
    raise exception 'store link not found' using errcode = '42501';
  end if;

  select jsonb_build_object(
      'id', store.id,
      'legacy_id', p_legacy_store_id,
      'name', store.name,
      'area', nullif(store.area, ''),
      'memo', nullif(store.notes, ''),
      'is_current', true
    )
    into v_store
  from public.stores store
  where store.user_id = v_user_id
    and store.id = v_store_id
  limit 1;

  if v_store is null then
    raise exception 'store not found' using errcode = '42501';
  end if;

  select coalesce(settings.fixed_charge_amount, 220)
    into v_fixed_charge
  from public.store_settings settings
  where settings.user_id = v_user_id
    and settings.store_id = v_store_id
  limit 1;
  v_fixed_charge := coalesce(v_fixed_charge, 220);

  select backup.payload, backup.updated_at
    into v_backup, v_backup_updated_at
  from public.hidaka_manual_backups backup
  where backup.user_id = v_user_id
    and backup.app_key = p_app_key
    and backup.store_id = v_store_id
  limit 1;

  if v_backup is not null then
    v_data_source := 'manual_backup';
    begin
      v_stock_date := nullif(v_backup #>> '{data,outOfStock,date}', '')::date;
    exception when others then
      v_stock_date := null;
    end;
    v_stock_ids := coalesce(v_backup #> '{data,outOfStock,ids}', '[]'::jsonb);

    select coalesce(jsonb_agg(menu_row.item order by menu_row.item ->> 'name'), '[]'::jsonb)
      into v_menu
    from (
      select jsonb_build_object(
        'id', item ->> 'id',
        'name', item ->> 'name',
        'category', item ->> 'category',
        'price', coalesce((item ->> 'price')::integer, 0),
        'tags', case when jsonb_typeof(item -> 'tags') = 'array' then item -> 'tags' else '[]'::jsonb end,
        'is_available', coalesce(item ->> 'available', 'true') <> 'false',
        'offering_type', coalesce(nullif(item ->> 'offeringType', ''), 'regular'),
        'seasons', case when jsonb_typeof(item -> 'seasons') = 'array' then item -> 'seasons' else '[]'::jsonb end,
        'available_from', nullif(item ->> 'availableFrom', ''),
        'available_until', nullif(item ->> 'availableUntil', ''),
        'is_sold_out', v_stock_date = current_date and v_stock_ids ? coalesce(item ->> 'id', ''),
        'is_orderable',
          coalesce(item ->> 'available', 'true') <> 'false'
          and not (v_stock_date = current_date and v_stock_ids ? coalesce(item ->> 'id', ''))
          and (nullif(item ->> 'availableFrom', '') is null or item ->> 'availableFrom' <= current_date::text)
          and (nullif(item ->> 'availableUntil', '') is null or item ->> 'availableUntil' >= current_date::text),
        'memo', nullif(item ->> 'memo', ''),
        'updated_at', nullif(item ->> 'updatedAt', '')
      ) as item
      from jsonb_array_elements(coalesce(v_backup #> '{data,menu}', '[]'::jsonb)) item
      where coalesce(nullif(item ->> 'storeId', ''), p_legacy_store_id) = p_legacy_store_id
    ) menu_row;

    with recent as (
      select
        history,
        coalesce(
          nullif(history ->> 'visitedAt', ''),
          nullif(history ->> 'date', '') || 'T00:00:00+09:00'
        ) as visited_at
      from jsonb_array_elements(coalesce(v_backup #> '{data,history}', '[]'::jsonb)) history
      where coalesce(nullif(history ->> 'storeId', ''), p_legacy_store_id) = p_legacy_store_id
      order by coalesce(nullif(history ->> 'visitedAt', ''), nullif(history ->> 'date', '')) desc
      limit p_recent_limit
    ), enriched as (
      select recent.*,
        coalesce(items.items, '[]'::jsonb) as items
      from recent
      cross join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'menu_id', nullif(line ->> 'menuId', ''),
            'name', line ->> 'name',
            'category', coalesce((
              select menu_item ->> 'category'
              from jsonb_array_elements(v_menu) menu_item
              where menu_item ->> 'id' = line ->> 'menuId'
              limit 1
            ), 'unknown'),
            'order_index', coalesce(nullif(line ->> 'orderIndex', '')::integer, ordinal::integer),
            'quantity', coalesce(nullif(line ->> 'quantity', '')::integer, 1),
            'unit_price', nullif(coalesce(line ->> 'unitPrice', line ->> 'price'), '')::integer,
            'source', coalesce(nullif(line ->> 'source', ''), 'legacy'),
            'recommendation_reason', nullif(line ->> 'recommendationReason', ''),
            'ai_suggestion', case when jsonb_typeof(line -> 'aiSuggestion') = 'object' then line -> 'aiSuggestion' else null end,
            'change_reason', nullif(line ->> 'changeReason', '')
          ) order by coalesce(nullif(line ->> 'orderIndex', '')::integer, ordinal::integer)
        ) as items
        from jsonb_array_elements(coalesce(recent.history -> 'items', '[]'::jsonb)) with ordinality as lines(line, ordinal)
      ) items
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', enriched.history ->> 'id',
        'visit_id', enriched.history ->> 'visitId',
        'visited_at', enriched.visited_at,
        'total_amount', nullif(enriched.history ->> 'total', '')::integer,
        'starting_drink', nullif(enriched.history #>> '{context,startingDrinkName}', ''),
        'items', enriched.items,
        'drinks', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'drink'),
        'skewers', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'skewer'),
        'snacks', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'small'),
        'manual_items', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'source' = 'manual'),
        'changed_items', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'source' = 'changed'),
        'feedback', case
          when jsonb_typeof(enriched.history -> 'feedback') = 'object' then jsonb_build_object(
            'satisfaction', (enriched.history #>> '{feedback,satisfaction}')::integer,
            'repeat_preference', nullif(enriched.history #>> '{feedback,repeatPreference}', ''),
            'amount_feeling', nullif(enriched.history #>> '{feedback,amount}', ''),
            'price_feeling', nullif(enriched.history #>> '{feedback,priceFeeling}', ''),
            'comment', nullif(enriched.history #>> '{feedback,comment}', '')
          )
          else null
        end
      ) order by enriched.visited_at desc
    ), '[]'::jsonb)
      into v_recent_orders
    from enriched;
  else
    v_data_source := 'normalized_tables';

    select coalesce(jsonb_agg(menu_row.item order by menu_row.item ->> 'name'), '[]'::jsonb)
      into v_menu
    from (
      select jsonb_build_object(
        'id', menu.id,
        'name', menu.name,
        'category', menu.category,
        'price', menu.price,
        'tags', to_jsonb(menu.tags),
        'is_available', menu.is_available,
        'offering_type', menu.offering_type,
        'seasons', to_jsonb(menu.seasons),
        'available_from', menu.available_from,
        'available_until', menu.available_until,
        'is_sold_out', sold_out.menu_id is not null,
        'is_orderable', menu.is_available
          and sold_out.menu_id is null
          and (menu.available_from is null or menu.available_from <= current_date)
          and (menu.available_until is null or menu.available_until >= current_date),
        'memo', nullif(menu.memo, ''),
        'updated_at', menu.updated_at
      ) as item
      from public.menu_items menu
      left join public.daily_menu_status sold_out
        on sold_out.user_id = menu.user_id
       and sold_out.store_id = menu.store_id
       and sold_out.menu_id = menu.id
       and sold_out.service_date = current_date
       and sold_out.status = 'sold_out'
      where menu.user_id = v_user_id
        and menu.store_id = v_store_id
        and menu.deleted_at is null
    ) menu_row;

    with recent as (
      select visit.*, feedback.satisfaction, feedback.would_order_again,
        feedback.avoid_next_time, feedback.amount_feeling,
        feedback.price_feeling, feedback.comment as feedback_comment
      from public.visits visit
      left join public.visit_feedback feedback
        on feedback.user_id = visit.user_id
       and feedback.visit_id = visit.id
      where visit.user_id = v_user_id
        and visit.store_id = v_store_id
        and visit.deleted_at is null
      order by visit.visited_at desc
      limit p_recent_limit
    ), enriched as (
      select recent.*,
        coalesce(items.items, '[]'::jsonb) as items
      from recent
      cross join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'menu_id', order_item.menu_id,
            'name', order_item.menu_name,
            'category', coalesce(menu.category, 'unknown'),
            'order_index', order_item.order_index,
            'quantity', order_item.quantity,
            'unit_price', order_item.unit_price,
            'source', order_item.source,
            'recommendation_reason', nullif(order_item.recommendation_reason, ''),
            'ai_suggestion', case when suggestion.id is null then null else jsonb_build_object(
              'menu_id', suggestion.menu_id,
              'name', suggestion.menu_name,
              'unit_price', suggestion.unit_price,
              'recommendation_reason', nullif(suggestion.recommendation_reason, '')
            ) end,
            'change_reason', nullif(order_item.change_reason, '')
          ) order by order_item.order_index
        ) as items
        from public.order_items order_item
        left join public.menu_items menu
          on menu.user_id = order_item.user_id
         and menu.id = order_item.menu_id
        left join public.recommendation_items suggestion
          on suggestion.user_id = order_item.user_id
         and suggestion.id = order_item.source_recommendation_item_id
        where order_item.user_id = v_user_id
          and order_item.visit_id = recent.id
          and order_item.deleted_at is null
      ) items
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', enriched.order_history_id,
        'visit_id', enriched.id,
        'visited_at', enriched.visited_at,
        'total_amount', enriched.total_amount,
        'starting_drink', nullif(enriched.starting_drink_name, ''),
        'items', enriched.items,
        'drinks', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'drink'),
        'skewers', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'skewer'),
        'snacks', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'category' = 'small'),
        'manual_items', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'source' = 'manual'),
        'changed_items', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(enriched.items) value where value ->> 'source' = 'changed'),
        'feedback', case when enriched.satisfaction is null
          and enriched.would_order_again is null and enriched.avoid_next_time is null
          and enriched.amount_feeling is null and enriched.price_feeling is null
          and nullif(enriched.feedback_comment, '') is null then null
          else jsonb_build_object(
            'satisfaction', enriched.satisfaction,
            'repeat_preference', case when enriched.would_order_again then 'again' when enriched.avoid_next_time then 'avoid' else null end,
            'amount_feeling', enriched.amount_feeling,
            'price_feeling', enriched.price_feeling,
            'comment', nullif(enriched.feedback_comment, '')
          )
        end
      ) order by enriched.visited_at desc
    ), '[]'::jsonb)
      into v_recent_orders
    from enriched;
  end if;

  with flattened as (
    select
      item,
      order_row ->> 'visited_at' as visited_at
    from jsonb_array_elements(v_recent_orders) order_row
    cross join lateral jsonb_array_elements(coalesce(order_row -> 'items', '[]'::jsonb)) item
    where item ->> 'source' <> 'fixed'
  ), frequencies as (
    select
      coalesce(nullif(item ->> 'menu_id', ''), item ->> 'name') as item_key,
      max(item ->> 'name') as name,
      count(*)::integer as order_count,
      max(visited_at) as last_ordered_at
    from flattened
    group by coalesce(nullif(item ->> 'menu_id', ''), item ->> 'name')
  )
  select jsonb_build_object(
    'frequent_recent_items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_key', ranked.item_key,
        'name', ranked.name,
        'order_count', ranked.order_count,
        'last_ordered_at', ranked.last_ordered_at
      ) order by ranked.order_count desc, ranked.last_ordered_at desc, ranked.name), '[]'::jsonb)
      from (select * from frequencies order by order_count desc, last_ordered_at desc, name limit 10) ranked
    ),
    'not_recently_ordered', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'menu_id', candidate.menu_item ->> 'id',
        'name', candidate.menu_item ->> 'name',
        'category', candidate.menu_item ->> 'category'
      ) order by candidate.menu_item ->> 'name'), '[]'::jsonb)
      from (
        select menu_item
        from jsonb_array_elements(v_menu) menu_item
        where coalesce((menu_item ->> 'is_orderable')::boolean, false)
          and not exists (
            select 1 from flattened
            where flattened.item ->> 'menu_id' = menu_item ->> 'id'
               or (nullif(flattened.item ->> 'menu_id', '') is null and flattened.item ->> 'name' = menu_item ->> 'name')
          )
        order by menu_item ->> 'name'
        limit 20
      ) candidate
    ),
    'recent_three_skewers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'menu_id', skewer.item ->> 'menu_id',
        'name', skewer.item ->> 'name',
        'visited_at', skewer.visited_at
      ) order by skewer.visit_number, (skewer.item ->> 'order_index')::integer), '[]'::jsonb)
      from (
        select order_row ->> 'visited_at' as visited_at, order_number as visit_number, item
        from jsonb_array_elements(v_recent_orders) with ordinality as orders(order_row, order_number)
        cross join lateral jsonb_array_elements(coalesce(order_row -> 'items', '[]'::jsonb)) item
        where order_number <= 3 and item ->> 'category' = 'skewer'
      ) skewer
    ),
    'order_frequency', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'item_key', frequencies.item_key,
        'name', frequencies.name,
        'order_count', frequencies.order_count,
        'last_ordered_at', frequencies.last_ordered_at
      ) order by frequencies.order_count desc, frequencies.last_ordered_at desc, frequencies.name), '[]'::jsonb)
      from frequencies
    ),
    'high_satisfaction_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', order_row ->> 'id',
        'visited_at', order_row ->> 'visited_at',
        'satisfaction', (order_row #>> '{feedback,satisfaction}')::integer
      ) order by order_row ->> 'visited_at' desc), '[]'::jsonb)
      from jsonb_array_elements(v_recent_orders) order_row
      where nullif(order_row #>> '{feedback,satisfaction}', '')::integer >= 4
    ),
    'low_satisfaction_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', order_row ->> 'id',
        'visited_at', order_row ->> 'visited_at',
        'satisfaction', (order_row #>> '{feedback,satisfaction}')::integer
      ) order by order_row ->> 'visited_at' desc), '[]'::jsonb)
      from jsonb_array_elements(v_recent_orders) order_row
      where nullif(order_row #>> '{feedback,satisfaction}', '')::integer <= 2
    )
  ) into v_order_summary;

  select jsonb_build_object(
    'has_keep', count(*) > 0,
    'fixed_charge', v_fixed_charge,
    'bottles', coalesce(jsonb_agg(jsonb_build_object(
      'id', bottle.id,
      'brand', bottle.brand,
      'remaining_percent', bottle.current_remaining,
      'started_on', bottle.kept_at
    ) order by bottle.kept_at desc) filter (where bottle.id is not null), '[]'::jsonb)
  ) into v_bottle_status
  from public.bottles bottle
  where bottle.user_id = v_user_id
    and bottle.store_id = v_store_id
    and bottle.status = 'active'
    and bottle.current_remaining > 0;

  return jsonb_build_object(
    'schema_version', 1,
    'generated_at', now(),
    'data_source', v_data_source,
    'snapshot_at', v_backup_updated_at,
    'store', v_store,
    'current_menu', v_menu,
    'recent_orders', v_recent_orders,
    'order_summary', v_order_summary,
    'bottle_status', v_bottle_status,
    'limitations', jsonb_build_array(
      '端末内だけの未バックアップ変更は含みません',
      case when v_data_source = 'manual_backup'
        then 'メニュー・履歴・品切れは最終手動バックアップ時点です'
        else '手動バックアップがないため正規化テーブル時点のデータです'
      end,
      'このRPCは読み取り専用です'
    )
  );
end;
$$;

comment on function public.get_hidaka_ai_context(text, text, integer) is
  'ハラケンナビ向け。本人の店舗・メニュー・直近注文・傾向・焼酎キープ状況を読み取り専用JSONで返す。';

revoke all on function public.get_hidaka_ai_context(text, text, integer) from public, anon, authenticated;
grant execute on function public.get_hidaka_ai_context(text, text, integer) to authenticated;

commit;
