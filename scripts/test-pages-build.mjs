import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { PUBLIC_FILES, buildPages, validatePublicConfig } from './build-pages.mjs';

const config = {
  enabled: true, mode: 'connection-check-only', supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_key', appKey: 'hidaka-order', legacyStoreId: 'hidaka-001',
  supabaseStoreId: '112e03a4-8d7f-41f4-9984-d39536398f11'
};
assert.deepEqual(validatePublicConfig(JSON.stringify(config)), config);
assert.equal(validatePublicConfig(JSON.stringify({ ...config, mode: 'manual-backup' })).mode, 'manual-backup');
assert.throws(() => validatePublicConfig(JSON.stringify({ ...config, mode: 'auto-sync' })));
for (const invalid of [undefined, '', '{}', JSON.stringify({ ...config, enabled: false }),
  JSON.stringify({ ...config, password: 'must-not-publish' }),
  JSON.stringify({ ...config, publishableKey: 'sb_secret_not_allowed' }),
  JSON.stringify({ ...config, publishableKey: 'eyJserviceRole' }),
  JSON.stringify({ ...config, supabaseUrl: 'https://example.supabase.co/?secret=value' }),
  JSON.stringify({ ...config, supabaseStoreId: 'wrong-id' })]) {
  assert.throws(() => validatePublicConfig(invalid));
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'hidaka-pages-test-'));
try {
  const projectRoot = path.join(temporaryRoot, 'source');
  await mkdir(projectRoot);
  for (const file of [...PUBLIC_FILES, '.env', 'config.local.json', 'supabase/private-import/backup.json', 'extra.zip']) {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await writeFile(path.join(projectRoot, file), 'fixture');
  }
  const outputDirectory = path.join(temporaryRoot, 'output');
  const files = await buildPages({ projectRoot, outputDirectory, configText: JSON.stringify(config) });
  const actualFiles = (await readdir(outputDirectory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => path.relative(outputDirectory, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
  assert.deepEqual(actualFiles, [...files].sort(), 'only public allowlisted files may be deployed');
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDirectory, 'config.local.json'), 'utf8')), config);
  await assert.rejects(() => buildPages({ projectRoot, outputDirectory, configText: JSON.stringify(config) }), /EEXIST/);

  // Exercise the unchanged app initializer with the generated file at the
  // production URL. No login tokens, email sending, or local data are involved.
  const source = await readFile(new URL('../supabase-connection.js', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const calls = [];
  const events = [];
  const window = { location: new URL('https://haraken59-bot.github.io/hidaka-order/'), dispatchEvent: event => events.push(event) };
  vm.runInNewContext(source, {
    window, URL, URLSearchParams, console,
    localStorage: { getItem: () => null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async url => {
      calls.push(url);
      if (url.startsWith('./config.local.json')) return { ok: true, status: 200, json: async () => JSON.parse(await readFile(path.join(outputDirectory, 'config.local.json'), 'utf8')) };
      assert.equal(url, `${config.supabaseUrl}/auth/v1/health`);
      return { ok: true, status: 200 };
    }
  });
  const status = await window.HidakaSupabase.initialize();
  assert.equal(status.state, 'ready');
  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.authenticated, false);
  assert.equal(status.storageMode, 'local-only');
  const elements = new Map(['cloudAuthSummary', 'cloudDataCounts', 'cloudLoginButton', 'cloudVerifyButton', 'cloudLogoutButton', 'cloudBackupButton', 'cloudRestoreButton', 'cloudBackupTime', 'cloudBackupCounts'].map(id => [`#${id}`, { disabled: true, hidden: false, textContent: '' }]));
  const renderCode = appSource.slice(appSource.indexOf('  function renderCloudAuthStatus('), appSource.indexOf('  function friendlyCloudError('));
  vm.runInNewContext(`${renderCode}\nrenderCloudAuthStatus(status);`, { status, cloudBusy: false, preparedCloudRestore: null, $: id => elements.get(id) });
  assert.equal(elements.get('#cloudLoginButton').disabled, false, 'public configuration must enable the login button');
  assert.equal(elements.get('#cloudLoginButton').hidden, false);
  assert.equal(calls.length, 2, 'initialization must not send emails or access user data');
} finally {
  // temporaryRoot is the exact test directory returned by mkdtemp.
  await rm(temporaryRoot, { recursive: true, force: true });
}
console.log('公開用設定の検査・秘密項目の拒否・公開ファイル限定・ログインボタンの有効化を確認しました。');
