import { copyFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_FILES = Object.freeze([
  'index.html', 'app.js', 'styles.css', 'supabase-connection.js',
  'service-worker.js', 'manifest.webmanifest',
  'data/stores.json', 'data/hidaka-menu.csv',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'
]);
const CONFIG_FIELDS = ['enabled', 'mode', 'supabaseUrl', 'publishableKey', 'appKey', 'legacyStoreId', 'supabaseStoreId'];

export function validatePublicConfig(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('公開用接続設定が未登録、またはJSON形式が不正です。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !CONFIG_FIELDS.includes(key))
    || CONFIG_FIELDS.some(key => !Object.hasOwn(raw, key))) {
    throw new Error('公開用接続設定には許可された7項目だけを指定してください。');
  }
  if (raw.enabled !== true || raw.mode !== 'connection-check-only'
    || raw.appKey !== 'hidaka-order' || raw.legacyStoreId !== 'hidaka-001') {
    throw new Error('日高オーダーの読み取り確認用設定が必要です。');
  }
  // Never accept a secret key or a legacy service-role JWT in a public artifact.
  if (typeof raw.publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(raw.publishableKey)) {
    throw new Error('ブラウザ用のPublishable keyだけを使用できます。');
  }
  if (typeof raw.supabaseUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(raw.supabaseUrl)) {
    throw new Error('Supabase接続先URLが不正です。');
  }
  if (typeof raw.supabaseStoreId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.supabaseStoreId)) {
    throw new Error('Supabase店舗IDが不正です。');
  }
  return Object.fromEntries(CONFIG_FIELDS.map(key => [key, raw[key]]));
}

export async function buildPages({ projectRoot, outputDirectory, configText }) {
  projectRoot = path.resolve(projectRoot);
  outputDirectory = path.resolve(outputDirectory);
  const config = validatePublicConfig(configText);
  const files = [];
  // Validate the complete allowlist before writing anything. Do not copy local
  // settings, backups, SQL imports, repository metadata, or a whole directory.
  for (const relative of PUBLIC_FILES) {
    const source = path.join(projectRoot, relative);
    for (let current = source; current !== projectRoot; current = path.dirname(current)) {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('公開元にシンボリックリンクは使用できません。');
    }
    if (!(await lstat(source)).isFile()) throw new Error('必要な公開ファイルがありません。');
    files.push({ relative, source });
  }
  // Refuse stale build directories rather than accidentally publishing extras.
  await mkdir(outputDirectory);
  for (const { relative, source } of files) {
    const destination = path.join(outputDirectory, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  // Keep the existing runtime URL for compatibility with installed apps.
  await writeFile(path.join(outputDirectory, 'config.local.json'), `${JSON.stringify(config, null, 2)}\n`);
  return [...PUBLIC_FILES, 'config.local.json'];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
    const files = await buildPages({ projectRoot, outputDirectory: path.join(projectRoot, 'dist'), configText: process.env.HIDAKA_SUPABASE_PUBLIC_CONFIG });
    console.log(`公開用ファイル ${files.length}件を準備しました（クラウド接続設定を含む）。`);
  } catch (error) {
    // Do not print environment values or parser errors that may contain them.
    console.error(error instanceof SyntaxError ? '公開用接続設定の形式が不正です。' : error.message);
    process.exitCode = 1;
  }
}
