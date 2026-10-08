// Optional isolated PostgreSQL/WASM test. PGLITE_MODULE points to a temporary runtime;
// never connects to Supabase, never requires a production secret.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
if (!process.env.PGLITE_MODULE) throw Error('Set PGLITE_MODULE to the temporary PGlite module path');
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table public.stores(id uuid primary key,user_id uuid,name text,area text,notes text);
create table public.bottles(id uuid,user_id uuid,store_id uuid,brand text,current_remaining numeric,kept_at date,status text);
grant select on public.stores,public.bottles to authenticated;
insert into auth.users values('00000000-0000-4000-8000-000000000001');
insert into stores values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','test','','');`);
for (const file of ['202609010001_core_tables.sql','202609010002_order_history_tables.sql','202609050001_manual_backups.sql','202610010001_direct_order_history.sql','202610080001_history_management.sql','202610080002_history_management_read_context.sql']) {
  await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
}
await db.exec(`insert into public.app_store_links(user_id,app_key,legacy_store_id,store_id) values('00000000-0000-4000-8000-000000000001','hidaka-order','hidaka-001','00000000-0000-4000-8000-000000000010');`);
for (const file of ['direct_order_history.sql','history_management.sql']) {
  await db.exec(readFileSync(new URL('../supabase/tests/'+file,import.meta.url),'utf8'));
  console.log(file+' passed in isolated PostgreSQL');
}
await db.close();
