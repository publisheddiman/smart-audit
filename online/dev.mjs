import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {publicDirectory} from './build.mjs';
import {createLocalStorage} from './local-db.mjs';
import worker from './worker.mjs';

const port = Number(process.env.SMART_AUDIT_PORT || 8787);
const origin = `http://127.0.0.1:${port}`;
const dataDirectory = new URL('./.data/', import.meta.url);
await mkdir(dataDirectory, {recursive: true});
const codeFile = new URL('access-code.txt', dataDirectory);
if (!existsSync(codeFile)) {
  await writeFile(codeFile, randomBytes(24).toString('base64url'), {flag: 'wx', mode: 0o600});
}
const code = process.env.SMART_AUDIT_ACCESS_CODE || (await readFile(codeFile, 'utf8')).trim();
if (code.length < 20) throw new Error('Kode masuk lokal minimal 20 karakter.');
const storage = createLocalStorage(fileURLToPath(new URL('smart-audit.sqlite', dataDirectory)));
const assets = new Map([
  ['/', {name: 'index.html', type: 'text/html; charset=utf-8'}],
  ['/index.html', {name: 'index.html', type: 'text/html; charset=utf-8'}],
  ['/cloud.js', {name: 'cloud.js', type: 'application/javascript; charset=utf-8'}]
]);

const env = {
  ...storage,
  TEAM_ACCESS_CODE: code,
  ASSETS: {
    async fetch(request) {
      const item = assets.get(new URL(request.url).pathname);
      if (!item) return new Response('Halaman tidak ditemukan.', {status: 404});
      return new Response(await readFile(new URL(item.name, publicDirectory)), {
        headers: {'Content-Type': item.type, 'X-Frame-Options': 'DENY'}
      });
    }
  }
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(origin + incoming.url, {
      method: incoming.method,
      headers: incoming.headers,
      ...(incoming.method !== 'GET' && incoming.method !== 'HEAD' ? {body: Readable.toWeb(incoming), duplex: 'half'} : {})
    });
    const result = await worker.fetch(request, env);
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    if (!result.body) outgoing.end();
    else Readable.fromWeb(result.body).pipe(outgoing);
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Smart Audit lokal: ${origin}`);
  console.log('Kode masuk lokal tersedia di online/.data/access-code.txt, atau dari SMART_AUDIT_ACCESS_CODE jika disetel.');
});
