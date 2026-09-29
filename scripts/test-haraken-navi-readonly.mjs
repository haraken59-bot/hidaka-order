import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../supabase-connection.js', import.meta.url), 'utf8');
const sql = await readFile(new URL('../supabase/migrations/202609220001_haraken_navi_read_context.sql', import.meta.url), 'utf8');
const storeId = '112e03a4-8d7f-41f4-9984-d39536398f11';

const sampleContext = {
  schema_version: 1,
  generated_at: '2026-09-22T00:00:00Z',
  data_source: 'manual_backup',
  snapshot_at: '2026-09-21T20:00:00Z',
  store: { id: storeId, legacy_id: 'hidaka-001', name: 'やきとり日高', is_current: true },
  current_menu: [{ id: 'base-001', name: 'ししとう串', category: 'skewer', price: 180, tags: ['野菜'], is_available: true, is_sold_out: false, is_orderable: true }],
  recent_orders: [{ id: 'history-1', visited_at: '2026-09-20T10:00:00+09:00', items: [], drinks: [], skewers: [], snacks: [], manual_items: [], changed_items: [], feedback: { satisfaction: 5 } }],
  order_summary: { frequent_recent_items: [], not_recently_ordered: [], recent_three_skewers: [], order_frequency: [], high_satisfaction_orders: [], low_satisfaction_orders: [] },
  bottle_status: { has_keep: true, fixed_charge: 220, bottles: [{ id: 'bottle-1', brand: '黒霧島', remaining_percent: 45, started_on: '2026-09-03' }] },
  limitations: ['端末内だけの未バックアップ変更は含みません']
};

function createHarness({ context = sampleContext, loggedIn = true } = {}) {
  const calls = [];
  const stored = new Map();
  const initialUrl = new URL(loggedIn
    ? 'http://127.0.0.1:8135/#access_token=access-token&refresh_token=refresh-token&expires_in=3600'
    : 'http://127.0.0.1:8135/');
  const location = { href: initialUrl.href, protocol: initialUrl.protocol, pathname: initialUrl.pathname, search: initialUrl.search, hash: initialUrl.hash };

  function response(body, { status = 200, headers = {} } = {}) {
    const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: name => normalizedHeaders.get(String(name).toLowerCase()) || null },
      async json() { return body; }
    };
  }

  async function mockFetch(url, options = {}) {
    const method = options.method || 'GET';
    calls.push({ url: String(url), method, body: options.body || '' });
    if (String(url).startsWith('./config.local.json')) return response({
      enabled: true,
      mode: 'manual-backup',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_test_key',
      appKey: 'hidaka-order',
      legacyStoreId: 'hidaka-001',
      supabaseStoreId: storeId
    });
    if (String(url).endsWith('/auth/v1/health')) return response({ version: 'test' });
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1', email: 'person@example.test' });
    if (String(url).includes('/rest/v1/app_store_links')) return response([{ store_id: storeId }]);
    if (String(url).includes('/rest/v1/menu_items')) return response([], { headers: { 'content-range': '0-0/101' } });
    if (String(url).includes('/rest/v1/visits')) return response([], { headers: { 'content-range': '0-0/7' } });
    if (String(url).includes('/rest/v1/store_settings')) return response([], { headers: { 'content-range': '0-0/1' } });
    if (String(url).includes('/rest/v1/rpc/get_hidaka_ai_context')) return response(context);
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }

  class MockCustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const window = {
    location,
    history: { replaceState() { location.hash = ''; } },
    dispatchEvent() {}
  };
  const localStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key)
  };
  vm.runInNewContext(source, {
    window,
    document: { title: '日高オーダー' },
    localStorage,
    fetch: mockFetch,
    CustomEvent: MockCustomEvent,
    URL,
    URLSearchParams,
    Date,
    JSON,
    String,
    Number,
    Object,
    Array,
    Map,
    RegExp,
    Error,
    Promise,
    Intl,
    TextEncoder,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    console
  });
  return { window, calls };
}

const harness = createHarness();
await harness.window.HidakaSupabase.initialize();
const result = await harness.window.HidakaSupabase.readHarakenNaviContext({ recentLimit: 5 });
assert.deepEqual(JSON.parse(JSON.stringify(result)), sampleContext);
const rpcCall = harness.calls.find(call => call.url.includes('/rpc/get_hidaka_ai_context'));
assert.ok(rpcCall, 'the AI context RPC must be called');
assert.equal(rpcCall.method, 'POST');
assert.deepEqual(JSON.parse(rpcCall.body), {
  p_app_key: 'hidaka-order',
  p_legacy_store_id: 'hidaka-001',
  p_recent_limit: 5
});
assert.equal(harness.calls.some(call => ['PATCH', 'PUT', 'DELETE'].includes(call.method)), false, 'the AI reference flow must never mutate data');
assert.deepEqual(
  harness.calls.filter(call => call.method === 'POST').map(call => new URL(call.url).pathname),
  ['/rest/v1/rpc/get_hidaka_ai_context'],
  'the only POST must be the read-only RPC'
);
await assert.rejects(() => harness.window.HidakaSupabase.readHarakenNaviContext({ recentLimit: 0 }), /1〜20件/);
await assert.rejects(() => harness.window.HidakaSupabase.readHarakenNaviContext({ recentLimit: 21 }), /1〜20件/);

const wrongStoreHarness = createHarness({ context: { ...sampleContext, store: { ...sampleContext.store, id: '8564e9a8-4e84-42df-a3a2-d462075c571c' } } });
await wrongStoreHarness.window.HidakaSupabase.initialize();
await assert.rejects(() => wrongStoreHarness.window.HidakaSupabase.readHarakenNaviContext(), /店舗または形式/);

const loggedOutHarness = createHarness({ loggedIn: false });
await loggedOutHarness.window.HidakaSupabase.initialize();
await assert.rejects(() => loggedOutHarness.window.HidakaSupabase.readHarakenNaviContext(), /先にクラウドへログイン/);
assert.equal(loggedOutHarness.calls.some(call => call.url.includes('/rpc/get_hidaka_ai_context')), false);

assert.match(sql, /security invoker/i);
assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i);
assert.match(sql, /public\.hidaka_manual_backups/i);
assert.match(sql, /public\.menu_items/i);
assert.match(sql, /public\.visits/i);
assert.match(sql, /public\.bottles/i);
assert.match(sql, /revoke all on function public\.get_hidaka_ai_context\(text, text, integer\) from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.get_hidaka_ai_context\(text, text, integer\) to authenticated/i);
const functionBody = sql.split('as $$')[1]?.split('$$;')[0] || '';
assert.doesNotMatch(functionBody, /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s+|merge\s+into)\b/i, 'the RPC body must contain no write statement');

console.log('Haraken Navi authenticated read-only context checks passed.');
