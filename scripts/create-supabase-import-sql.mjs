import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  throw new Error(message);
}

const inputPath = path.resolve(process.argv[2] || path.join('supabase', 'private-import', 'supabase-import.json'));
const outputPath = path.resolve(process.argv[3] || path.join(path.dirname(inputPath), 'supabase-import.sql'));
const sourceText = await readFile(inputPath, 'utf8');
const payload = JSON.parse(sourceText);

if (payload?.format !== 'hidaka-order-supabase-import' || payload?.version !== 2) {
  fail('共有店舗ID対応の投入前JSON（version 2）ではありません');
}

const requiredTables = [
  'app_store_links',
  'menu_items',
  'store_settings',
  'daily_menu_status',
  'visits',
  'recommendation_runs',
  'recommendation_items',
  'order_items',
  'visit_feedback'
];

for (const table of requiredTables) {
  if (!Array.isArray(payload.tables?.[table])) fail(`投入前JSONに${table}配列がありません`);
}

const dollarTag = '$hidaka_order_import$';
if (sourceText.includes(dollarTag)) fail('投入前JSONにSQL区切り文字と同じ文字列が含まれています');

const counts = Object.fromEntries(requiredTables.map(table => [table, payload.tables[table].length]));
const countLines = requiredTables.map(table => `--   ${table}: ${counts[table]}件`).join('\n');

const sql = `-- 日高オーダー 初回データ登録SQL
-- 生成元: ${path.basename(inputPath)}
-- 生成日時: ${new Date().toISOString()}
-- Supabase SQL Editorで内容確認後に、全体を一度だけ実行する。
-- 同じデータを再実行しても、主キーを基準に更新され件数は増えない。
${countLines}

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temp table hidaka_import_payload (
  data jsonb not null
) on commit drop;

insert into hidaka_import_payload (data)
values (${dollarTag}${sourceText.trim()}${dollarTag}::jsonb);

do $$
declare
  import_format text;
  import_version integer;
  expected_store_count integer;
  matched_store_count integer;
  owner_count integer;
begin
  select data ->> 'format', (data ->> 'version')::integer
    into import_format, import_version
  from hidaka_import_payload;

  if import_format <> 'hidaka-order-supabase-import' or import_version <> 2 then
    raise exception '投入前JSONの形式またはバージョンが一致しません';
  end if;

  select jsonb_array_length(data -> 'tables' -> 'app_store_links')
    into expected_store_count
  from hidaka_import_payload;

  select count(*)
    into matched_store_count
  from hidaka_import_payload p
  cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'app_store_links')
    as x(store_id uuid)
  join public.stores s on s.id = x.store_id;

  select count(distinct s.user_id)
    into owner_count
  from hidaka_import_payload p
  cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'app_store_links')
    as x(store_id uuid)
  join public.stores s on s.id = x.store_id;

  if expected_store_count < 1 then
    raise exception '店舗対応が1件もありません';
  end if;
  if matched_store_count <> expected_store_count then
    raise exception '選択済み店舗がSupabaseに存在しません';
  end if;
  if owner_count <> 1 then
    raise exception '店舗の所有者を1人に特定できません';
  end if;
end;
$$;

create temp table hidaka_import_owner (
  user_id uuid primary key
) on commit drop;

insert into hidaka_import_owner (user_id)
select distinct s.user_id
from hidaka_import_payload p
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'app_store_links')
  as x(store_id uuid)
join public.stores s on s.id = x.store_id;

insert into public.app_store_links (
  user_id, app_key, legacy_store_id, store_id, created_at, updated_at
)
select o.user_id, x.app_key, x.legacy_store_id, x.store_id, x.created_at, x.updated_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'app_store_links') as x(
  app_key text, legacy_store_id text, store_id uuid,
  created_at timestamptz, updated_at timestamptz
)
on conflict (user_id, app_key, legacy_store_id) do update set
  store_id = excluded.store_id,
  updated_at = excluded.updated_at;

insert into public.menu_items (
  user_id, id, store_id, name, category, price, tags,
  is_actual_price, is_available, recommendation_type, offering_type,
  seasons, available_from, available_until, memo,
  created_at, updated_at, deleted_at
)
select
  o.user_id, x.id, x.store_id, x.name, x.category, x.price, x.tags,
  x.is_actual_price, x.is_available, x.recommendation_type, x.offering_type,
  x.seasons, x.available_from, x.available_until, x.memo,
  x.created_at, x.updated_at, x.deleted_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'menu_items') as x(
  id text, store_id uuid, name text, category text, price integer, tags text[],
  is_actual_price boolean, is_available boolean, recommendation_type text,
  offering_type text, seasons text[], available_from date, available_until date,
  memo text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
on conflict (user_id, id) do update set
  store_id = excluded.store_id,
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  tags = excluded.tags,
  is_actual_price = excluded.is_actual_price,
  is_available = excluded.is_available,
  recommendation_type = excluded.recommendation_type,
  offering_type = excluded.offering_type,
  seasons = excluded.seasons,
  available_from = excluded.available_from,
  available_until = excluded.available_until,
  memo = excluded.memo,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at;

insert into public.store_settings (
  user_id, store_id, default_budget, default_hunger, default_skewer_count,
  must_shishito, avoid_recent_orders, recent_history_depth,
  fixed_charge_name, fixed_charge_amount, fixed_charge_position,
  hunger_dish_counts, extra_rules, updated_at
)
select
  o.user_id, x.store_id, x.default_budget, x.default_hunger, x.default_skewer_count,
  x.must_shishito, x.avoid_recent_orders, x.recent_history_depth,
  x.fixed_charge_name, x.fixed_charge_amount, x.fixed_charge_position,
  x.hunger_dish_counts, x.extra_rules, x.updated_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'store_settings') as x(
  store_id uuid, default_budget integer, default_hunger text, default_skewer_count smallint,
  must_shishito boolean, avoid_recent_orders boolean, recent_history_depth smallint,
  fixed_charge_name text, fixed_charge_amount integer, fixed_charge_position text,
  hunger_dish_counts jsonb, extra_rules jsonb, updated_at timestamptz
)
on conflict (user_id, store_id) do update set
  default_budget = excluded.default_budget,
  default_hunger = excluded.default_hunger,
  default_skewer_count = excluded.default_skewer_count,
  must_shishito = excluded.must_shishito,
  avoid_recent_orders = excluded.avoid_recent_orders,
  recent_history_depth = excluded.recent_history_depth,
  fixed_charge_name = excluded.fixed_charge_name,
  fixed_charge_amount = excluded.fixed_charge_amount,
  fixed_charge_position = excluded.fixed_charge_position,
  hunger_dish_counts = excluded.hunger_dish_counts,
  extra_rules = excluded.extra_rules,
  updated_at = excluded.updated_at;

insert into public.daily_menu_status (
  user_id, store_id, menu_id, service_date, status, memo, created_at
)
select o.user_id, x.store_id, x.menu_id, x.service_date, x.status, x.memo, x.created_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'daily_menu_status') as x(
  store_id uuid, menu_id text, service_date date, status text,
  memo text, created_at timestamptz
)
on conflict (user_id, store_id, menu_id, service_date) do update set
  status = excluded.status,
  memo = excluded.memo;

insert into public.visits (
  user_id, id, order_history_id, store_id, visited_at, visit_time_known,
  recorded_at, budget, hunger, skewer_count, moods,
  starting_drink_menu_id, starting_drink_name, must_shishito, want_finish,
  avoid_recent, shochu_keep_used, visit_stage, plans_second_venue,
  seafood_requested, meat_requested, seasonal_requested,
  stay_duration_minutes, other_wishes, total_amount, memo,
  created_at, updated_at, deleted_at
)
select
  o.user_id, x.id, x.order_history_id, x.store_id, x.visited_at, x.visit_time_known,
  x.recorded_at, x.budget, x.hunger, x.skewer_count, x.moods,
  x.starting_drink_menu_id, x.starting_drink_name, x.must_shishito, x.want_finish,
  x.avoid_recent, x.shochu_keep_used, x.visit_stage, x.plans_second_venue,
  x.seafood_requested, x.meat_requested, x.seasonal_requested,
  x.stay_duration_minutes, x.other_wishes, x.total_amount, x.memo,
  x.created_at, x.updated_at, x.deleted_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'visits') as x(
  id text, order_history_id text, store_id uuid, visited_at timestamptz,
  visit_time_known boolean, recorded_at timestamptz, budget integer, hunger text,
  skewer_count smallint, moods text[], starting_drink_menu_id text,
  starting_drink_name text, must_shishito boolean, want_finish boolean,
  avoid_recent boolean, shochu_keep_used boolean, visit_stage text,
  plans_second_venue boolean, seafood_requested boolean, meat_requested boolean,
  seasonal_requested boolean, stay_duration_minutes integer, other_wishes text,
  total_amount integer, memo text, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz
)
on conflict (user_id, id) do update set
  order_history_id = excluded.order_history_id,
  store_id = excluded.store_id,
  visited_at = excluded.visited_at,
  visit_time_known = excluded.visit_time_known,
  recorded_at = excluded.recorded_at,
  budget = excluded.budget,
  hunger = excluded.hunger,
  skewer_count = excluded.skewer_count,
  moods = excluded.moods,
  starting_drink_menu_id = excluded.starting_drink_menu_id,
  starting_drink_name = excluded.starting_drink_name,
  must_shishito = excluded.must_shishito,
  want_finish = excluded.want_finish,
  avoid_recent = excluded.avoid_recent,
  shochu_keep_used = excluded.shochu_keep_used,
  visit_stage = excluded.visit_stage,
  plans_second_venue = excluded.plans_second_venue,
  seafood_requested = excluded.seafood_requested,
  meat_requested = excluded.meat_requested,
  seasonal_requested = excluded.seasonal_requested,
  stay_duration_minutes = excluded.stay_duration_minutes,
  other_wishes = excluded.other_wishes,
  total_amount = excluded.total_amount,
  memo = excluded.memo,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at;

insert into public.recommendation_runs (
  user_id, id, store_id, visit_id, generated_at,
  algorithm_version, conditions, estimated_total, notices
)
select
  o.user_id, x.id, x.store_id, x.visit_id, x.generated_at,
  x.algorithm_version, x.conditions, x.estimated_total, x.notices
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'recommendation_runs') as x(
  id uuid, store_id uuid, visit_id text, generated_at timestamptz,
  algorithm_version text, conditions jsonb, estimated_total integer, notices text[]
)
on conflict (user_id, id) do update set
  store_id = excluded.store_id,
  visit_id = excluded.visit_id,
  generated_at = excluded.generated_at,
  algorithm_version = excluded.algorithm_version,
  conditions = excluded.conditions,
  estimated_total = excluded.estimated_total,
  notices = excluded.notices;

insert into public.recommendation_items (
  user_id, id, recommendation_run_id, menu_id, menu_name,
  order_index, quantity, unit_price, recommendation_reason
)
select
  o.user_id, x.id, x.recommendation_run_id, x.menu_id, x.menu_name,
  x.order_index, x.quantity, x.unit_price, x.recommendation_reason
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'recommendation_items') as x(
  id uuid, recommendation_run_id uuid, menu_id text, menu_name text,
  order_index smallint, quantity smallint, unit_price integer, recommendation_reason text
)
on conflict (user_id, id) do update set
  recommendation_run_id = excluded.recommendation_run_id,
  menu_id = excluded.menu_id,
  menu_name = excluded.menu_name,
  order_index = excluded.order_index,
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  recommendation_reason = excluded.recommendation_reason;

insert into public.order_items (
  user_id, id, visit_id, menu_id, menu_name, order_index, quantity,
  unit_price, subtotal, source, recommendation_reason,
  source_recommendation_item_id, change_reason,
  created_at, updated_at, deleted_at
)
select
  o.user_id, x.id, x.visit_id, x.menu_id, x.menu_name, x.order_index, x.quantity,
  x.unit_price, x.subtotal, x.source, x.recommendation_reason,
  x.source_recommendation_item_id, x.change_reason,
  x.created_at, x.updated_at, x.deleted_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'order_items') as x(
  id text, visit_id text, menu_id text, menu_name text, order_index smallint,
  quantity smallint, unit_price integer, subtotal integer, source text,
  recommendation_reason text, source_recommendation_item_id uuid,
  change_reason text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
on conflict (user_id, id) do update set
  visit_id = excluded.visit_id,
  menu_id = excluded.menu_id,
  menu_name = excluded.menu_name,
  order_index = excluded.order_index,
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  subtotal = excluded.subtotal,
  source = excluded.source,
  recommendation_reason = excluded.recommendation_reason,
  source_recommendation_item_id = excluded.source_recommendation_item_id,
  change_reason = excluded.change_reason,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at;

insert into public.visit_feedback (
  user_id, visit_id, satisfaction, would_order_again, avoid_next_time,
  amount_feeling, price_feeling, comment, created_at, updated_at
)
select
  o.user_id, x.visit_id, x.satisfaction, x.would_order_again, x.avoid_next_time,
  x.amount_feeling, x.price_feeling, x.comment, x.created_at, x.updated_at
from hidaka_import_payload p
cross join hidaka_import_owner o
cross join lateral jsonb_to_recordset(p.data -> 'tables' -> 'visit_feedback') as x(
  visit_id text, satisfaction smallint, would_order_again boolean,
  avoid_next_time boolean, amount_feeling text, price_feeling text,
  comment text, created_at timestamptz, updated_at timestamptz
)
on conflict (user_id, visit_id) do update set
  satisfaction = excluded.satisfaction,
  would_order_again = excluded.would_order_again,
  avoid_next_time = excluded.avoid_next_time,
  amount_feeling = excluded.amount_feeling,
  price_feeling = excluded.price_feeling,
  comment = excluded.comment,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

commit;
`;

await writeFile(outputPath, sql, 'utf8');

console.log(JSON.stringify({
  input_file: path.basename(inputPath),
  output_file: path.basename(outputPath),
  output_bytes: Buffer.byteLength(sql, 'utf8'),
  counts,
  transaction: true,
  idempotent_upserts: requiredTables.length,
  executed: false
}, null, 2));
