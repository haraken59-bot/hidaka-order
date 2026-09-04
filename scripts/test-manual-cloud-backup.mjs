import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const authSource = readFileSync(new URL('../supabase-connection.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const key = 'hidaka-order-v1';
const rescueKey = 'hidaka-order-before-cloud-restore-v1';
const storeId = '112e03a4-8d7f-41f4-9984-d39536398f11';

function harness(mode = 'manual-backup') {
  const storage = new Map();
  const writes = [], requests = [], elements = new Map();
  const settings = { mode, user: 'owner-a', row: null, fail: false, quota: false, delay: null };
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, disabled: false, dataset: {},
      focus() {}, close() { this.open = false; }, showModal() { this.open = true; } });
    return elements.get(id);
  };
  const response = (data, code = 200, range = null) => ({ ok: code < 400, status: code, json: async () => copy(data), headers: { get: () => range } });
  const localStorage = {
    getItem: k => storage.get(k) ?? null,
    setItem(k, v) { if (settings.quota && k === key) throw new Error('保存容量が不足しています'); storage.set(k, String(v)); writes.push(k); },
    removeItem: k => storage.delete(k)
  };
  const window = { location: new URL('http://127.0.0.1:8135/#access_token=test-token&refresh_token=test-refresh&expires_in=3600'),
    history: { replaceState() { window.location.hash = ''; } }, dispatchEvent() {} };
  const context = vm.createContext({ window, document: { title: '日高オーダー', querySelector: element, querySelectorAll: () => [] }, localStorage,
    CustomEvent: class { constructor(type, args) { this.type = type; this.detail = args.detail; } }, URL, URLSearchParams, TextEncoder, crypto: webcrypto,
    clearTimeout() {}, setTimeout() { return 1; }, console,
    fetch: async (input, options = {}) => {
      const url = String(input), method = options.method || 'GET';
      requests.push({ url, method, body: options.body, headers: options.headers });
      if (url.startsWith('./config.local.json')) return response({ enabled: true, mode: settings.mode, supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', appKey: 'hidaka-order', legacyStoreId: 'hidaka-001', supabaseStoreId: storeId });
      if (url.endsWith('/health') || url.includes('/logout')) return response({});
      if (url.endsWith('/auth/v1/user')) return response({ id: settings.user, email: 'test@example.invalid' });
      if (url.includes('/app_store_links')) return response([{ store_id: storeId }]);
      if (url.includes('/hidaka_manual_backups')) {
        if (settings.delay) await settings.delay;
        if (settings.fail) return response({ message: 'test network failure' }, 503);
        if (method === 'POST') {
          const body = JSON.parse(options.body), data = body.payload.data;
          settings.row = { ...body, updated_at: '2026-09-05T08:30:00Z', menu_count: data.menu.length,
            initial_menu_count: data.initialMenu.length, history_count: data.history.length,
            store_count: data.stores.length, stock_count: data.outOfStock.ids.length };
        }
        return response(settings.row ? [settings.row] : []);
      }
      if (/\/rest\/v1\/(menu_items|visits|store_settings)/.test(url)) return response([], 200, '0-0/1');
      throw new Error('Unexpected request: ' + method + ' ' + url);
    }
  });
  vm.runInContext(authSource, context);
  const instrumented = appSource.replace(/\n\s*boot\(\);\s*\n\}\)\(\);\s*$/, `
    renderMoodChoices = applyPreferences = renderMenuEditor = renderHistorySummary = renderOrder = schedulePendingReminder = () => {};
    globalThis.testApp = { defaultState, normalizeMenuItem, normalizeHistoryItem, normalizeFullBackup,
      createFullBackupPayload, backupToCloud, previewCloudRestore, confirmCloudRestore, refreshCloudBackupInfo,
      applyRestoredState, showDataPage, backupCountsLabel,
      setState: value => {state=value;}, getState: () => state,
      cancelPreview: () => {preparedCloudRestore=null;}, getPreview: () => preparedCloudRestore };
  })();`);
  assert.notEqual(instrumented, appSource);
  vm.runInContext(instrumented, context);
  return { cloud: window.HidakaSupabase, app: context.testApp, storage, writes, requests, settings, element };
}

const h = harness();
await h.cloud.initialize();
assert.equal(h.cloud.getStatus().manualBackupEnabled, true);
assert.equal(h.requests.filter(r => r.url.includes('/rest/v1/')).every(r => r.method === 'GET'), true);
assert.equal(h.requests.some(r => r.url.includes('hidaka_manual_backups')), false, 'startup must not save or restore backups');
const state = copy(h.app.defaultState());
state.menu = [h.app.normalizeMenuItem({ id: 'custom-paused', name: '自分の追加串', price: 198, category: 'skewer', tags: ['豚','内臓','独自タグ'], available: false, offeringType: 'seasonal', seasons: ['autumn'], memo: '編集済み' })];
state.initialMenu = copy(state.menu);
state.history = [h.app.normalizeHistoryItem({ id: 'history-1', date: '2026-09-04', items: [{ name: '自分の追加串', price: 180, quantity: 2 }], feedback: { satisfaction: 5, comment: 'また頼みたい' } }, state.menu)];
state.outOfStock = { date: new Date().toLocaleDateString('sv-SE'), ids: ['custom-paused'] };
state.pendingOrder = { id: 'pending-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), order: { items: copy(state.menu), preferences: copy(state.preferences), notices: [], total: 198 } };
h.app.setState(state); h.storage.set(key, JSON.stringify(state));
const before = JSON.stringify(state), payload = copy(h.app.createFullBackupPayload());
const meta = await h.cloud.saveManualBackup(payload);
assert.equal(meta.updated_at, '2026-09-05T08:30:00Z');
assert.deepEqual(h.settings.row.payload, payload, 'all complete-backup fields must be stored, including initialMenu, migrations, pending order and feedback');
assert.equal(JSON.stringify(payload).includes('test-token'), false, 'auth sessions must never be included');
assert.equal(h.storage.get(key), before, 'cloud upload must not change local data');
const posts = h.requests.filter(r => r.method === 'POST' && r.url.includes('/rest/v1/'));
assert.equal(posts.length, 1);
assert.equal(posts[0].url.includes('/hidaka_manual_backups?'), true);
assert.equal(posts[0].headers.Prefer, 'resolution=merge-duplicates,return=representation');
assert.equal(posts[0].body.includes('updated_at'), false, 'server controls timestamp');
await h.app.previewCloudRestore();
assert.ok(h.app.getPreview());
assert.equal(h.storage.get(key), before, 'preview must not write local data');
assert.match(h.element('#cloudRestoreComparison').textContent, /クラウド最終更新/);
assert.match(h.element('#cloudRestoreComparison').textContent, /休止 1品/);
h.app.cancelPreview();
await h.app.confirmCloudRestore();
assert.equal(h.storage.get(key), before, 'cancelled confirmation cannot restore');

const altered = copy(state); altered.menu[0].price = 999;
h.app.setState(altered); h.storage.set(key, JSON.stringify(altered));
await h.app.previewCloudRestore();
h.storage.set(key, 'changed-by-another-tab');
await h.app.confirmCloudRestore();
assert.equal(h.storage.get(key), 'changed-by-another-tab', 'cross-tab changes block stale restore');
assert.match(h.element('#cloudRestoreStatus').textContent, /端末データが変わりました/);
h.storage.set(key, JSON.stringify(altered));
await h.app.previewCloudRestore();
h.settings.user = 'owner-b';
await h.app.confirmCloudRestore();
assert.equal(h.app.getState().menu[0].price, 999, 'account change blocks restore');
h.settings.user = 'owner-a';
await h.app.previewCloudRestore();
h.settings.quota = true;
await h.app.confirmCloudRestore();
assert.equal(h.app.getState().menu[0].price, 999, 'quota failure must preserve in-memory state');
assert.equal(JSON.parse(h.storage.get(key)).menu[0].price, 999);
h.settings.quota = false;
await h.app.previewCloudRestore();
await h.app.confirmCloudRestore();
assert.equal(h.app.getState().menu[0].price, 198);
assert.equal(h.app.getState().menu[0].available, false);
assert.deepEqual(copy(h.app.getState().menu[0].tags), ['豚','内臓','独自タグ']);
assert.equal(h.app.getState().history[0].items[0].price, 180);
assert.equal(h.app.getState().history[0].feedback.satisfaction, 5);
assert.ok(h.app.getState().pendingOrder);
assert.equal(JSON.parse(h.storage.get(rescueKey)).data.menu[0].price, 999);
assert.match(h.element('#cloudActionStatus').textContent, /クラウドから復元しました/);

const restoredJson = h.storage.get(key);
h.settings.row.menu_count++;
await h.app.previewCloudRestore();
assert.equal(h.app.getPreview(), null);
assert.equal(h.storage.get(key), restoredJson, 'corrupt cloud data must never overwrite local');
h.settings.row.menu_count--;
h.settings.fail = true;
await h.app.backupToCloud();
assert.doesNotMatch(h.element('#cloudActionStatus').textContent, /^クラウドへバックアップしました/);
assert.equal(h.storage.get(key), restoredJson);
h.settings.fail = false;

let release;
h.settings.delay = new Promise(resolve => { release=resolve; });
const firstSave = h.app.backupToCloud();
const requestCount = h.requests.filter(r => r.method === 'POST').length;
await h.app.backupToCloud();
assert.equal(h.requests.filter(r => r.method === 'POST').length, requestCount, 'double click must not start another upload');
release(); await firstSave; h.settings.delay = null;
assert.match(h.element('#cloudActionStatus').textContent, /^クラウドへバックアップしました/);
await assert.rejects(h.cloud.saveManualBackup({ ...payload, schemaVersion: 999 }), /形式/);
const readOnly = harness('connection-check-only'); await readOnly.cloud.initialize();
await assert.rejects(readOnly.cloud.saveManualBackup(payload), /有効/);
assert.equal(readOnly.requests.filter(r => r.url.includes('/rest/v1/')).every(r => r.method === 'GET'), true);
await h.cloud.signOut();
await assert.rejects(h.cloud.readBackup(), /ログイン/);
assert.equal(h.storage.get(key), restoredJson, 'logout must retain app data');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.equal((html.match(/data-open-management=/g) || []).length, 4);
for (const id of ['cloudRestoreDialog','cloudRestoreComparison','cancelCloudRestore','confirmCloudRestore','restoreFullBackupFile','downloadCurrentMenu','menuEditor','exportStatus']) assert.ok(html.includes(`id="${id}"`));
console.log('手動クラウド保存・所有者確認・日時/件数・確認/キャンセル・別タブ変更・容量不足・復元前コピー・旧設定の読取専用・自動同期なしを確認しました。');
