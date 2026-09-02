import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../supabase-connection.js', import.meta.url), 'utf8');
const storeId = '112e03a4-8d7f-41f4-9984-d39536398f11';

function createHarness(href) {
  const calls = [];
  const stored = new Map();
  const replacements = [];
  const initialUrl = new URL(href);
  const location = {
    href: initialUrl.href,
    protocol: initialUrl.protocol,
    pathname: initialUrl.pathname,
    search: initialUrl.search,
    hash: initialUrl.hash
  };

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
    if (String(url).startsWith('./config.local.json')) {
      return response({
        enabled: true,
        mode: 'connection-check-only',
        supabaseUrl: 'https://example.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        appKey: 'hidaka-order',
        legacyStoreId: 'hidaka-001',
        supabaseStoreId: storeId
      });
    }
    if (String(url).endsWith('/auth/v1/health')) return response({ version: 'test' });
    if (String(url).includes('/auth/v1/otp')) return response({});
    if (String(url).endsWith('/auth/v1/verify')) {
      return response({ access_token: 'verified-access', refresh_token: 'verified-refresh', expires_in: 3600 });
    }
    if (String(url).includes('grant_type=refresh_token')) {
      return response({ access_token: 'refreshed-access', refresh_token: 'refreshed-refresh', expires_in: 3600 });
    }
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1', email: 'person@example.test' });
    if (String(url).includes('/rest/v1/app_store_links')) return response([{ store_id: storeId }]);
    if (String(url).includes('/rest/v1/menu_items')) return response([], { headers: { 'content-range': '0-0/101' } });
    if (String(url).includes('/rest/v1/visits')) return response([], { headers: { 'content-range': '0-0/6' } });
    if (String(url).includes('/rest/v1/store_settings')) return response([], { headers: { 'content-range': '0-0/1' } });
    if (String(url).includes('/auth/v1/logout')) return response({});
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }

  class MockCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const window = {
    location,
    history: {
      replaceState(_state, _title, nextUrl) {
        replacements.push(String(nextUrl));
        location.hash = '';
        location.href = `${initialUrl.origin}${nextUrl}`;
      }
    },
    events: [],
    dispatchEvent(event) { this.events.push(event); }
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
    RegExp,
    Error,
    Promise,
    console
  });

  return { window, stored, calls, replacements };
}

const mailHarness = createHarness('http://127.0.0.1:8135/?verify=magic-link');
const ready = await mailHarness.window.HidakaSupabase.initialize();
assert.equal(ready.state, 'ready');
const sent = await mailHarness.window.HidakaSupabase.sendMagicLink('person@example.test');
assert.equal(sent.state, 'link-sent');
assert.equal(sent.authenticated, false);
assert.equal(mailHarness.stored.size, 0, 'sending a link must not create a local session');
const otpCall = mailHarness.calls.find(call => call.url.includes('/auth/v1/otp'));
assert.ok(otpCall, 'magic-link endpoint must be called');
assert.deepEqual(JSON.parse(otpCall.body), { email: 'person@example.test', create_user: false });
assert.equal(new URL(otpCall.url).searchParams.get('redirect_to'), 'http://127.0.0.1:8135/');

await assert.rejects(
  () => mailHarness.window.HidakaSupabase.verifyMagicLink('https://example.invalid/auth/v1/verify?token=wrong&type=magiclink'),
  /この日高オーダー用のログインリンクではありません/
);
const pastedLink = 'https://example.supabase.co/auth/v1/verify?token=one-time-token-hash&type=magiclink&redirect_to=http://127.0.0.1:8135/';
const pastedSignedIn = await mailHarness.window.HidakaSupabase.verifyMagicLink(pastedLink);
assert.equal(pastedSignedIn.state, 'signed-in');
assert.equal(pastedSignedIn.userEmail, 'person@example.test');
assert.deepEqual({ ...pastedSignedIn.cloudCounts }, { menuItems: 101, visits: 6, storeSettings: 1 });
const verifyCall = mailHarness.calls.find(call => call.url.endsWith('/auth/v1/verify'));
assert.deepEqual(JSON.parse(verifyCall.body), { token_hash: 'one-time-token-hash', type: 'magiclink' });
assert.equal([...mailHarness.stored.values()].join('\n').includes('one-time-token-hash'), false, 'pasted link must not be persisted');
await mailHarness.window.HidakaSupabase.signOut();

const callbackHarness = createHarness('http://127.0.0.1:8135/#access_token=access-token&refresh_token=refresh-token&expires_in=3600');
const signedIn = await callbackHarness.window.HidakaSupabase.initialize();
assert.equal(signedIn.state, 'signed-in');
assert.equal(signedIn.authenticated, true);
assert.equal(signedIn.userEmail, 'person@example.test');
assert.deepEqual({ ...signedIn.cloudCounts }, { menuItems: 101, visits: 6, storeSettings: 1 });
assert.deepEqual(callbackHarness.replacements, ['/']);
const persisted = [...callbackHarness.stored.values()].join('\n');
assert.equal(persisted.includes('person@example.test'), false, 'email is not needed in the persisted session');
assert.equal(callbackHarness.calls.filter(call => call.url.includes('/rest/v1/')).every(call => call.method === 'GET'), true, 'cloud data checks must be read-only');

const signedOut = await callbackHarness.window.HidakaSupabase.signOut();
assert.equal(signedOut.authenticated, false);
assert.equal(callbackHarness.stored.size, 0);

console.log('Supabase magic-link/read-only checks passed.');
