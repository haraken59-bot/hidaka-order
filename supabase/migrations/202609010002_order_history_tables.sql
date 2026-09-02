-- 日高オーダー Supabase移行 第2段階
-- 当日の品切れ・来店・AI提案・注文明細・感想と、それぞれのRLSを作成する。
-- 前提: 202609010001_core_tables.sql が適用済みであること。
-- 2026-09-01: 確認用。まだSupabaseでは実行していない。

begin;

create table public.daily_menu_status (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  store_id uuid not null,
  menu_id text not null,
  service_date date not null,
  status text not null default 'sold_out',
  memo text not null default '',
  created_at timestamptz not null default now(),

  constraint daily_menu_status_pkey primary key (id),
  constraint daily_menu_status_owner_item_date_key
    unique (user_id, store_id, menu_id, service_date),
  constraint daily_menu_status_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint daily_menu_status_menu_fkey
    foreign key (user_id, store_id, menu_id)
    references public.menu_items (user_id, store_id, id)
    on update cascade
    on delete restrict,
  constraint daily_menu_status_status_valid check (
    status in ('sold_out')
  )
);

create table public.visits (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id text not null,
  order_history_id text,
  store_id uuid not null,
  visited_at timestamptz not null,
  visit_time_known boolean not null default false,
  recorded_at timestamptz not null default now(),
  budget integer,
  hunger text,
  skewer_count smallint,
  moods text[] not null default '{}'::text[],
  starting_drink_menu_id text,
  starting_drink_name text not null default '',
  must_shishito boolean,
  want_finish boolean,
  avoid_recent boolean,
  shochu_keep_used boolean,
  visit_stage text,
  plans_second_venue boolean,
  seafood_requested boolean,
  meat_requested boolean,
  seasonal_requested boolean,
  stay_duration_minutes integer,
  other_wishes text not null default '',
  total_amount integer,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint visits_pkey primary key (user_id, id),
  constraint visits_owner_store_id_key unique (user_id, store_id, id),
  constraint visits_owner_history_id_key unique (user_id, order_history_id),
  constraint visits_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint visits_starting_drink_fkey
    foreign key (user_id, store_id, starting_drink_menu_id)
    references public.menu_items (user_id, store_id, id)
    on update cascade
    on delete restrict,
  constraint visits_id_not_blank check (btrim(id) <> ''),
  constraint visits_history_id_not_blank check (
    order_history_id is null or btrim(order_history_id) <> ''
  ),
  constraint visits_budget_nonnegative check (
    budget is null or budget >= 0
  ),
  constraint visits_hunger_valid check (
    hunger is null or hunger in ('light', 'normal', 'hearty')
  ),
  constraint visits_skewer_count_valid check (
    skewer_count is null or skewer_count between 0 and 10
  ),
  constraint visits_visit_stage_valid check (
    visit_stage is null or visit_stage in ('first', 'second', 'other')
  ),
  constraint visits_stay_duration_nonnegative check (
    stay_duration_minutes is null or stay_duration_minutes >= 0
  ),
  constraint visits_total_nonnegative check (
    total_amount is null or total_amount >= 0
  )
);

create table public.recommendation_runs (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  store_id uuid not null,
  visit_id text,
  generated_at timestamptz not null default now(),
  algorithm_version text not null,
  conditions jsonb not null default '{}'::jsonb,
  estimated_total integer,
  notices text[] not null default '{}'::text[],

  constraint recommendation_runs_pkey primary key (user_id, id),
  constraint recommendation_runs_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint recommendation_runs_visit_fkey
    foreign key (user_id, store_id, visit_id)
    references public.visits (user_id, store_id, id)
    on update cascade
    on delete cascade,
  constraint recommendation_runs_algorithm_not_blank check (
    btrim(algorithm_version) <> ''
  ),
  constraint recommendation_runs_conditions_object check (
    jsonb_typeof(conditions) = 'object'
  ),
  constraint recommendation_runs_total_nonnegative check (
    estimated_total is null or estimated_total >= 0
  )
);

create table public.recommendation_items (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  recommendation_run_id uuid not null,
  menu_id text,
  menu_name text not null,
  order_index smallint not null,
  quantity smallint not null default 1,
  unit_price integer,
  recommendation_reason text not null default '',

  constraint recommendation_items_pkey primary key (user_id, id),
  constraint recommendation_items_run_order_key
    unique (user_id, recommendation_run_id, order_index),
  constraint recommendation_items_run_fkey
    foreign key (user_id, recommendation_run_id)
    references public.recommendation_runs (user_id, id)
    on update cascade
    on delete cascade,
  constraint recommendation_items_menu_fkey
    foreign key (user_id, menu_id)
    references public.menu_items (user_id, id)
    on update cascade
    on delete restrict,
  constraint recommendation_items_name_not_blank check (
    btrim(menu_name) <> ''
  ),
  constraint recommendation_items_order_index_positive check (
    order_index > 0
  ),
  constraint recommendation_items_quantity_positive check (
    quantity > 0
  ),
  constraint recommendation_items_unit_price_nonnegative check (
    unit_price is null or unit_price >= 0
  )
);

create table public.order_items (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id text not null,
  visit_id text not null,
  menu_id text,
  menu_name text not null,
  order_index smallint not null,
  quantity smallint not null default 1,
  unit_price integer,
  subtotal integer,
  source text not null default 'legacy',
  recommendation_reason text not null default '',
  source_recommendation_item_id uuid,
  change_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint order_items_pkey primary key (user_id, id),
  constraint order_items_visit_fkey
    foreign key (user_id, visit_id)
    references public.visits (user_id, id)
    on update cascade
    on delete cascade,
  constraint order_items_menu_fkey
    foreign key (user_id, menu_id)
    references public.menu_items (user_id, id)
    on update cascade
    on delete restrict,
  constraint order_items_recommendation_item_fkey
    foreign key (user_id, source_recommendation_item_id)
    references public.recommendation_items (user_id, id)
    on update cascade
    on delete restrict,
  constraint order_items_id_not_blank check (btrim(id) <> ''),
  constraint order_items_name_not_blank check (btrim(menu_name) <> ''),
  constraint order_items_order_index_positive check (order_index > 0),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_nonnegative check (
    unit_price is null or unit_price >= 0
  ),
  constraint order_items_subtotal_nonnegative check (
    subtotal is null or subtotal >= 0
  ),
  constraint order_items_source_valid check (
    source in ('recommended', 'manual', 'changed', 'fixed', 'legacy')
  )
);

create table public.visit_feedback (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  visit_id text not null,
  satisfaction smallint,
  would_order_again boolean,
  avoid_next_time boolean,
  amount_feeling text,
  price_feeling text,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint visit_feedback_pkey primary key (user_id, visit_id),
  constraint visit_feedback_visit_fkey
    foreign key (user_id, visit_id)
    references public.visits (user_id, id)
    on update cascade
    on delete cascade,
  constraint visit_feedback_satisfaction_valid check (
    satisfaction is null or satisfaction between 1 and 5
  ),
  constraint visit_feedback_repeat_choice_valid check (
    not (would_order_again is true and avoid_next_time is true)
  ),
  constraint visit_feedback_amount_valid check (
    amount_feeling is null or amount_feeling in ('small', 'just', 'large')
  ),
  constraint visit_feedback_price_valid check (
    price_feeling is null or price_feeling in ('cheap', 'fair', 'expensive')
  ),
  constraint visit_feedback_comment_length check (
    char_length(comment) <= 300
  )
);

create index daily_menu_status_lookup_idx
  on public.daily_menu_status (user_id, store_id, service_date, status);

create index visits_recent_idx
  on public.visits (user_id, store_id, visited_at desc)
  where deleted_at is null;

create index recommendation_runs_visit_idx
  on public.recommendation_runs (user_id, visit_id, generated_at desc);

create unique index order_items_visit_order_active_key
  on public.order_items (user_id, visit_id, order_index)
  where deleted_at is null;

create index order_items_recent_menu_idx
  on public.order_items (user_id, menu_id, visit_id)
  where deleted_at is null;

create trigger visits_set_updated_at
before update on public.visits
for each row execute function public.set_hidaka_updated_at();

create trigger order_items_set_updated_at
before update on public.order_items
for each row execute function public.set_hidaka_updated_at();

create trigger visit_feedback_set_updated_at
before update on public.visit_feedback
for each row execute function public.set_hidaka_updated_at();

alter table public.daily_menu_status enable row level security;
alter table public.visits enable row level security;
alter table public.recommendation_runs enable row level security;
alter table public.recommendation_items enable row level security;
alter table public.order_items enable row level security;
alter table public.visit_feedback enable row level security;

revoke all on table public.daily_menu_status from anon, authenticated;
revoke all on table public.visits from anon, authenticated;
revoke all on table public.recommendation_runs from anon, authenticated;
revoke all on table public.recommendation_items from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.visit_feedback from anon, authenticated;

grant select, insert, update, delete on table public.daily_menu_status to authenticated;
grant select, insert, update, delete on table public.visits to authenticated;
grant select, insert, update, delete on table public.recommendation_runs to authenticated;
grant select, insert, update, delete on table public.recommendation_items to authenticated;
grant select, insert, update, delete on table public.order_items to authenticated;
grant select, insert, update, delete on table public.visit_feedback to authenticated;

create policy daily_menu_status_select_own
on public.daily_menu_status for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy daily_menu_status_insert_own
on public.daily_menu_status for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy daily_menu_status_update_own
on public.daily_menu_status for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy daily_menu_status_delete_own
on public.daily_menu_status for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visits_select_own
on public.visits for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visits_insert_own
on public.visits for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visits_update_own
on public.visits for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visits_delete_own
on public.visits for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_runs_select_own
on public.recommendation_runs for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_runs_insert_own
on public.recommendation_runs for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_runs_update_own
on public.recommendation_runs for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_runs_delete_own
on public.recommendation_runs for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_items_select_own
on public.recommendation_items for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_items_insert_own
on public.recommendation_items for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_items_update_own
on public.recommendation_items for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy recommendation_items_delete_own
on public.recommendation_items for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy order_items_select_own
on public.order_items for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy order_items_insert_own
on public.order_items for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy order_items_update_own
on public.order_items for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy order_items_delete_own
on public.order_items for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visit_feedback_select_own
on public.visit_feedback for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visit_feedback_insert_own
on public.visit_feedback for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visit_feedback_update_own
on public.visit_feedback for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy visit_feedback_delete_own
on public.visit_feedback for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;
