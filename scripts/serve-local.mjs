// ローカル確認専用。公開資産とローカル設定以外は配信しない。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES } from './build-pages.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const allowed = new Set([...PUBLIC_FILES, 'config.local.json']);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.csv': 'text/csv', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (request, response) => {
  let file;
  try { file = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).slice(1) || 'index.html'; }
  catch { response.writeHead(400); response.end(); return; }
  if (!allowed.has(file) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end(); return; }
  try {
    const data = await readFile(path.join(root, file));
    response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}${file.endsWith('.png') ? '' : '; charset=utf-8'}`, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404); response.end(); }
}).listen(8135, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:8135/'));
