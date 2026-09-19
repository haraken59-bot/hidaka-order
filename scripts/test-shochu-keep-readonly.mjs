import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../supabase-connection.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const storeId = '112e03a4-8d7f-41f4-9984-d39536398f11';
const otherStoreId = '8564e9a8-4e84-42df-a3a2-d462075c571c';
const bottleA = 'a8df5c2b-fce7-4233-b1b0-ff0d2b55ac92';
const bottleB = 'bf4cfa04-3202-43f3-a48a-6f4b030bfbde';

function createHarness({ referenceRows = [], bottleRows = [], failRpc = false } = {}) {
  const calls = [];
  const stored = new Map();
  const initialUrl = new URL('http://127.0.0.1:8135/#access_token=access-token&refresh_token=refresh-token&expires_in=3600');
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
    if (String(url).includes('/rest/v1/stores?')) return response([{ id: storeId, name: 'やきとり日高' }]);
    if (String(url).includes('/rest/v1/rpc/get_shochu_keep_reference')) {
      if (failRpc) throw new Error('NetworkError');
      return response(referenceRows);
    }
    if (String(url).includes('/rest/v1/bottles?')) return response(bottleRows);
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
    console
  });
  return { window, calls };
}

const referenceRows = [
  { bottle_id: bottleA, store_id: storeId, store_name: 'やきとり日高', brand: '黒霧島', remaining_percent: 45, last_visited_on: '2026-09-18', status: 'active' },
  { bottle_id: bottleB, store_id: storeId, store_name: 'やきとり日高', brand: '白岳しろ', remaining_percent: 70, last_visited_on: '2026-09-12', status: 'active' },
  { bottle_id: '730ee6c0-dade-4d5a-a4b4-4140321409c0', store_id: otherStoreId, store_name: '別店舗', brand: '別銘柄', remaining_percent: 80, last_visited_on: '2026-09-19', status: 'active' }
];
const bottleRows = [
  { id: bottleA, store_id: storeId, brand: '黒霧島', current_remaining: 45, kept_at: '2026-09-03', status: 'active' },
  { id: bottleB, store_id: storeId, brand: '白岳しろ', current_remaining: 70, kept_at: '2026-09-10', status: 'active' }
];

const harness = createHarness({ referenceRows, bottleRows });
await harness.window.HidakaSupabase.initialize();
const result = await harness.window.HidakaSupabase.readShochuKeepStatus();
assert.deepEqual(JSON.parse(JSON.stringify(result)), {
  storeId,
  storeName: 'やきとり日高',
  bottles: [
    { id: bottleB, storeId, brand: '白岳しろ', remaining: 70, keptAt: '2026-09-10', status: 'active' },
    { id: bottleA, storeId, brand: '黒霧島', remaining: 45, keptAt: '2026-09-03', status: 'active' }
  ]
});
const rpcCall = harness.calls.find(call => call.url.includes('/rpc/get_shochu_keep_reference'));
assert.ok(rpcCall, 'existing read-only RPC must be used');
assert.equal(rpcCall.method, 'POST');
assert.deepEqual(JSON.parse(rpcCall.body), { p_include_finished: false });
const bottleCall = harness.calls.find(call => call.url.includes('/rest/v1/bottles?'));
assert.equal(bottleCall.method, 'GET');
const bottleUrl = new URL(bottleCall.url);
assert.equal(bottleUrl.searchParams.get('store_id'), `eq.${storeId}`);
assert.equal(bottleUrl.searchParams.get('status'), 'eq.active');
assert.equal(bottleUrl.searchParams.get('current_remaining'), 'gt.0');
const nonReadCalls = harness.calls.filter(call => !['GET', 'HEAD'].includes(call.method));
assert.deepEqual(nonReadCalls.map(call => new URL(call.url).pathname), ['/rest/v1/rpc/get_shochu_keep_reference'], 'only the established read-only RPC may use POST');

const emptyHarness = createHarness({ referenceRows: [], bottleRows: [] });
await emptyHarness.window.HidakaSupabase.initialize();
assert.deepEqual(JSON.parse(JSON.stringify(await emptyHarness.window.HidakaSupabase.readShochuKeepStatus())).bottles, []);

const mismatchHarness = createHarness({ referenceRows: [referenceRows[0]], bottleRows: [{ ...bottleRows[0], current_remaining: 44 }] });
await mismatchHarness.window.HidakaSupabase.initialize();
await assert.rejects(() => mismatchHarness.window.HidakaSupabase.readShochuKeepStatus(), /一致しません/);

const networkHarness = createHarness({ referenceRows, bottleRows, failRpc: true });
await networkHarness.window.HidakaSupabase.initialize();
await assert.rejects(() => networkHarness.window.HidakaSupabase.readShochuKeepStatus(), /NetworkError/);
assert.equal(networkHarness.window.HidakaSupabase.getStatus().authenticated, true, 'a keep read failure must not sign the app out');

const loggedOutHarness = createHarness();
loggedOutHarness.window.location.hash = '';
loggedOutHarness.window.location.href = 'http://127.0.0.1:8135/';
await loggedOutHarness.window.HidakaSupabase.initialize();
await assert.rejects(() => loggedOutHarness.window.HidakaSupabase.readShochuKeepStatus(), /先にクラウドへログイン/);
assert.equal(loggedOutHarness.calls.some(call => call.url.includes('/rpc/get_shochu_keep_reference')), false);

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.attributes = {};
    this.title = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
const keepContainer = new TestElement('div');
const uiBlockStart = appSource.indexOf('  function shochuKeepMessage');
const uiBlockEnd = appSource.indexOf('\n  function renderCloudAuthStatus', uiBlockStart);
assert.ok(uiBlockStart >= 0 && uiBlockEnd > uiBlockStart, 'keep UI functions must be present');
const uiContext = {
  window: {},
  document: { createElement: tagName => new TestElement(tagName) },
  $: selector => selector === '#shochuKeepStatus' ? keepContainer : null,
  yen: value => `¥${value}`,
  KEEP_SHOCHU_FEE: { price: 220 },
  Array,
  String,
  Number,
  Error,
  Promise
};
vm.createContext(uiContext);
vm.runInContext(appSource.slice(uiBlockStart, uiBlockEnd), uiContext);
uiContext.renderShochuKeepStatus(result);
assert.equal(keepContainer.className, 'shochu-keep-card is-success');
assert.equal(keepContainer.attributes['aria-busy'], 'false');
assert.equal(keepContainer.children[0].textContent, 'キープ中 2本');
const renderedBottles = keepContainer.children[1].children;
assert.equal(renderedBottles[0].children[0].textContent, '白岳しろ');
assert.equal(renderedBottles[0].children[1].textContent, '残量 約70%');
assert.equal(renderedBottles[0].children[2].textContent, '開始 2026/9/10');
assert.equal(renderedBottles[0].children[3].textContent, '割代 ¥220（固定）');
uiContext.renderShochuKeepStatus({ storeName: 'やきとり日高', bottles: [] });
assert.equal(keepContainer.children[0].textContent, '現在キープなし・割代 ¥220（固定）');

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.equal(indexSource.includes('焼酎キープの割代 ¥220 は毎回'), false, 'the drink field must not repeat the keep fee');

console.log('Shochu keep read-only integration checks passed.');
