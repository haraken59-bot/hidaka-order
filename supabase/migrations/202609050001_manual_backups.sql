-- 手動バックアップ専用。既存のメニュー・来店・キープ帳テーブルの行は変更しない。
begin;

create table public.hidaka_manual_backups (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app_key text not null check (app_key = 'hidaka-order'),
  store_id uuid not null,
  backup_id uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  menu_count integer generated always as (jsonb_array_length(payload->'data'->'menu')) stored,
  initial_menu_count integer generated always as (jsonb_array_length(payload->'data'->'initialMenu')) stored,
  history_count integer generated always as (jsonb_array_length(payload->'data'->'history')) stored,
  store_count integer generated always as (jsonb_array_length(payload->'data'->'stores')) stored,
  stock_count integer generated always as (jsonb_array_length(payload->'data'->'outOfStock'->'ids')) stored,
  constraint hidaka_manual_backups_pkey primary key (user_id, app_key, store_id),
  constraint hidaka_manual_backups_link_fkey foreign key (user_id, app_key, store_id)
    references public.app_store_links(user_id, app_key, store_id) on delete restrict,
  constraint hidaka_manual_backups_payload_valid check (
    (payload->>'format' = 'hidaka-order-full-backup'
    and payload->>'schemaVersion' = '6'
    and jsonb_typeof(payload->'data'->'menu') = 'array'
    and jsonb_typeof(payload->'data'->'initialMenu') = 'array'
    and jsonb_typeof(payload->'data'->'history') = 'array'
    and jsonb_typeof(payload->'data'->'stores') = 'array'
    and jsonb_typeof(payload->'data'->'preferences') = 'object'
    and jsonb_typeof(payload->'data'->'outOfStock'->'ids') = 'array'
    and (payload->'data' ? 'pendingOrder')) is true
  ),
  constraint hidaka_manual_backups_size_limit check (octet_length(payload::text) <= 10485760)
);

-- 日時はクライアントの時計ではなくDBで確定。更新要求での指定を許さない。
create trigger hidaka_manual_backups_set_updated_at
before update on public.hidaka_manual_backups
for each row execute function public.set_hidaka_updated_at();

alter table public.hidaka_manual_backups enable row level security;
revoke all on table public.hidaka_manual_backups from public, anon, authenticated;
grant select on table public.hidaka_manual_backups to authenticated;
grant insert (user_id, app_key, store_id, backup_id, payload),
      update (user_id, app_key, store_id, backup_id, payload)
on public.hidaka_manual_backups to authenticated;

create policy hidaka_manual_backups_select_own
on public.hidaka_manual_backups for select to authenticated
using ((select auth.uid()) = user_id);

create policy hidaka_manual_backups_insert_own
on public.hidaka_manual_backups for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy hidaka_manual_backups_update_own
on public.hidaka_manual_backups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 未ログイン・他の利用者・削除は不許可。1利用者/アプリ/店舗につき最新1件。
notify pgrst, 'reload schema';
commit;
