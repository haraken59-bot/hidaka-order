-- 日高オーダー Supabase移行 第1段階
-- shochu-keep-ledgerの既存storesを共用し、店舗対応・メニュー・店舗別設定を作成する。
-- 既存のstores、bottles、store_visitsなどのデータやRLSは変更しない。
-- 2026-09-02: 確認用。まだSupabaseでは実行していない。

begin;

do $$
begin
  if to_regclass('public.stores') is null then
    raise exception '必要な既存テーブル public.stores がありません';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) then
    raise exception 'public.storesのidまたはuser_idが想定したuuid型ではありません';
  end if;
end;
$$;

-- 新しいテーブルから「同じ利用者の店舗」だけを参照できるよう、
-- 既存storesへ所有者込みの一意制約を追加する。既存行は変更しない。
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stores'::regclass
      and conname = 'stores_user_id_id_key'
  ) then
    alter table public.stores
      add constraint stores_user_id_id_key unique (user_id, id);
  end if;
end;
$$;

create table public.app_store_links (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  app_key text not null,
  legacy_store_id text not null,
  store_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_store_links_pkey
    primary key (user_id, app_key, legacy_store_id),
  constraint app_store_links_user_app_store_key
    unique (user_id, app_key, store_id),
  constraint app_store_links_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint app_store_links_app_key_not_blank check (btrim(app_key) <> ''),
  constraint app_store_links_legacy_id_not_blank check (btrim(legacy_store_id) <> '')
);

create table public.menu_items (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  id text not null,
  store_id uuid not null,
  name text not null,
  category text not null,
  price integer not null,
  tags text[] not null default '{}'::text[],
  is_actual_price boolean not null default false,
  is_available boolean not null default true,
  recommendation_type text not null default 'normal',
  offering_type text not null default 'regular',
  seasons text[] not null default '{}'::text[],
  available_from date,
  available_until date,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint menu_items_pkey primary key (user_id, id),
  constraint menu_items_user_store_id_key unique (user_id, store_id, id),
  constraint menu_items_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint menu_items_id_not_blank check (btrim(id) <> ''),
  constraint menu_items_name_not_blank check (btrim(name) <> ''),
  constraint menu_items_price_nonnegative check (price >= 0),
  constraint menu_items_category_valid check (
    category in ('drink', 'small', 'skewer', 'main', 'finish', 'dessert', 'fee')
  ),
  constraint menu_items_recommendation_type_valid check (
    recommendation_type in ('normal', 'recommended', 'priority', 'avoid')
  ),
  constraint menu_items_offering_type_valid check (
    offering_type in ('regular', 'seasonal', 'limited')
  ),
  constraint menu_items_seasons_valid check (
    seasons <@ array['spring', 'summer', 'autumn', 'winter']::text[]
  ),
  constraint menu_items_regular_has_no_seasons check (
    offering_type = 'seasonal' or cardinality(seasons) = 0
  ),
  constraint menu_items_regular_has_no_period check (
    offering_type <> 'regular'
    or (available_from is null and available_until is null)
  ),
  constraint menu_items_available_period_valid check (
    available_from is null
    or available_until is null
    or available_until >= available_from
  )
);

create table public.store_settings (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  store_id uuid not null,
  default_budget integer not null default 3000,
  default_hunger text not null default 'normal',
  default_skewer_count smallint not null default 3,
  must_shishito boolean not null default true,
  avoid_recent_orders boolean not null default true,
  recent_history_depth smallint not null default 3,
  fixed_charge_name text,
  fixed_charge_amount integer,
  fixed_charge_position text not null default 'last',
  hunger_dish_counts jsonb not null default
    '{"light": 1, "normal": 2, "hearty": 3}'::jsonb,
  extra_rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint store_settings_pkey primary key (id),
  constraint store_settings_user_store_key unique (user_id, store_id),
  constraint store_settings_store_fkey
    foreign key (user_id, store_id)
    references public.stores (user_id, id)
    on update cascade
    on delete restrict,
  constraint store_settings_budget_nonnegative check (default_budget >= 0),
  constraint store_settings_hunger_valid check (
    default_hunger in ('light', 'normal', 'hearty')
  ),
  constraint store_settings_skewer_count_valid check (
    default_skewer_count between 0 and 10
  ),
  constraint store_settings_history_depth_valid check (
    recent_history_depth between 0 and 100
  ),
  constraint store_settings_fixed_charge_amount_valid check (
    fixed_charge_amount is null or fixed_charge_amount >= 0
  ),
  constraint store_settings_fixed_charge_position_valid check (
    fixed_charge_position in ('last')
  ),
  constraint store_settings_hunger_counts_object check (
    jsonb_typeof(hunger_dish_counts) = 'object'
  ),
  constraint store_settings_extra_rules_object check (
    jsonb_typeof(extra_rules) = 'object'
  )
);

create index menu_items_store_active_idx
  on public.menu_items (user_id, store_id, is_available)
  where deleted_at is null;

create index menu_items_store_offering_idx
  on public.menu_items (user_id, store_id, offering_type)
  where deleted_at is null;

create or replace function public.set_hidaka_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_hidaka_updated_at() from public;
grant execute on function public.set_hidaka_updated_at() to authenticated;

create trigger app_store_links_set_updated_at
before update on public.app_store_links
for each row execute function public.set_hidaka_updated_at();

create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_hidaka_updated_at();

create trigger store_settings_set_updated_at
before update on public.store_settings
for each row execute function public.set_hidaka_updated_at();

alter table public.app_store_links enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_settings enable row level security;

revoke all on table public.app_store_links from anon, authenticated;
revoke all on table public.menu_items from anon, authenticated;
revoke all on table public.store_settings from anon, authenticated;

grant select, insert, update, delete on table public.app_store_links to authenticated;
grant select, insert, update, delete on table public.menu_items to authenticated;
grant select, insert, update, delete on table public.store_settings to authenticated;

create policy app_store_links_select_own
on public.app_store_links for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy app_store_links_insert_own
on public.app_store_links for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy app_store_links_update_own
on public.app_store_links for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy app_store_links_delete_own
on public.app_store_links for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy menu_items_select_own
on public.menu_items for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy menu_items_insert_own
on public.menu_items for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy menu_items_update_own
on public.menu_items for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy menu_items_delete_own
on public.menu_items for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy store_settings_select_own
on public.store_settings for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy store_settings_insert_own
on public.store_settings for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy store_settings_update_own
on public.store_settings for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy store_settings_delete_own
on public.store_settings for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;
