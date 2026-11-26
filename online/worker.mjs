import {sqliteWorkspace} from './sqlite-workspace.mjs';

const SESSION_SECONDS = 12 * 60 * 60;
const MAX_DATA = 1_500_000;
const MAX_FILE = 10 * 1024 * 1024;
const encoder = new TextEncoder();
const idPattern = /^[a-zA-Z0-9-]{6,80}$/;
const yearPattern = /^\d{4}$/;
const sectors = new Set(['BANGUNAN', 'INDUSTRI', 'TRANSPORTASI', 'PENYEDIA']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function headers(extra = {}) {
  return {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra};
}

function json(data, status = 200, extra = {}) {
  return Response.json(data, {status, headers: headers(extra)});
}

async function readBody(request, maxBytes) {
  if (Number(request.headers.get('Content-Length')) > maxBytes) {
    throw new HttpError(413, 'Ukuran data melebihi batas penyimpanan.');
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Ukuran data melebihi batas penyimpanan.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJson(request, size) {
  const bytes = await readBody(request, size);
  try {
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch {
    throw new HttpError(400, 'Format data tidak valid.');
  }
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function cookieName(url) {
  return url.protocol === 'https:' ? '__Host-smart_audit' : 'smart_audit_local';
}

function cookie(url, value, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(url)}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`;
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function validSession(request, url, secret) {
  const name = cookieName(url) + '=';
  const token = request.headers.get('Cookie')?.split(/;\s*/).find(value => value.startsWith(name))?.slice(name.length);
  if (!token || !/^\d{10}\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split('.');
  if (Number(expires) <= now() || Number(expires) > now() + SESSION_SECONDS) return false;
  const expected = await sign(`${expires}.${nonce}`, secret);
  return equalBytes(encoder.encode(signature), encoder.encode(expected));
}

async function login(request, env, url, repository) {
  const body = await readJson(request, 1024);
  if (typeof body?.code !== 'string') throw new HttpError(400, 'Masukkan kode masuk tim.');
  const client = env.clientAddress || request.headers.get('CF-Connecting-IP') || 'local';
  const time = now();
  if (await repository.countAttempts(client, time) > 8) {
    throw new HttpError(429, 'Terlalu banyak percobaan. Coba lagi beberapa menit.');
  }
  const [supplied, expected] = await Promise.all([body.code, env.TEAM_ACCESS_CODE].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  if (!equalBytes(new Uint8Array(supplied), new Uint8Array(expected))) {
    throw new HttpError(401, 'Kode masuk tim tidak cocok.');
  }
  await repository.clearAttempts(client, time);
  const session = `${time + SESSION_SECONDS}.${crypto.randomUUID()}`;
  const token = `${session}.${await sign(session, env.TEAM_ACCESS_CODE)}`;
  return json({ok: true}, 200, {'Set-Cookie': cookie(url, token, SESSION_SECONDS)});
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const recordList = value => Array.isArray(value) && value.every(object);
const audit = value => object(value) && ['tanggal', 'lingkup', 'metode'].every(key => typeof value[key] === 'string');
const consumption = value => object(value) && Object.values(value).every(amount =>
  amount === '' || (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0));
const travel = value => object(value) && recordList(value.business) && recordList(value.commuting) && typeof value.notes === 'string';
const period = value => object(value) && audit(value.audit) && consumption(value.consumption) &&
  travel(value.travel) && recordList(value.recs) &&
  Number.isFinite(value.savings_pct) && value.savings_pct >= 0 && value.savings_pct <= 100;
const profile = value => object(value) && typeof value.name === 'string' && sectors.has(value.sector) &&
  ['docs', 'managers', 'certs', 'qualif'].every(key => recordList(value[key]));

function validWorkspace(data) {
  if (!object(data) || !recordList(data.companies) || !recordList(data.regs)) return false;
  const ids = data.companies.map(company => company.id);
  if (new Set(ids).size !== ids.length) return false;
  return data.companies.every(company => profile(company) && period(company) &&
    typeof company.id === 'string' && idPattern.test(company.id) &&
    object(company.auditYears) && Object.entries(company.auditYears).every(([year, record]) =>
      yearPattern.test(year) && period(record) && profile(record.profile)) &&
    (company.auditYear === '' || (typeof company.auditYear === 'string' &&
      yearPattern.test(company.auditYear) && Object.hasOwn(company.auditYears, company.auditYear))) &&
    (company.pendingAudit == null || period(company.pendingAudit)));
}

async function workspace(request, repository) {
  if (request.method === 'GET') {
    const row = await repository.read();
    if (!row) throw new HttpError(503, 'Database belum disiapkan.');
    return json(row);
  }
  if (request.method !== 'PUT') throw new HttpError(405, 'Metode tidak tersedia.');
  const body = await readJson(request, MAX_DATA);
  if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || !validWorkspace(body.data)) {
    throw new HttpError(400, 'Data ruang kerja tidak valid.');
  }
  const data = {companies: body.data.companies, regs: body.data.regs};
  if (!await repository.write(body.revision, data)) {
    throw new HttpError(409, 'Ada perubahan dari pengguna lain. Salin isian yang belum disimpan, lalu pilih Muat Ulang.');
  }
  return json({revision: body.revision + 1});
}

async function files(request, env, path, repository) {
  const [id, operation, ...rest] = path.split('/');
  if (!idPattern.test(id)) throw new HttpError(404, 'Berkas tidak ditemukan.');
  const key = 'file:' + id;
  if (operation === 'upload-token' && !rest.length && env.FILES.createUploadToken && request.method === 'POST') {
    return json(await env.FILES.createUploadToken(key, MAX_FILE));
  }
  if (operation !== undefined) throw new HttpError(404, 'Berkas tidak ditemukan.');
  if (request.method === 'POST') {
    let bytes;
    try {
      bytes = await readBody(request, MAX_FILE);
    } catch (error) {
      if (error.status === 413) throw new HttpError(413, 'Ukuran berkas maksimal 10 MB.');
      throw error;
    }
    await env.FILES.put(key, bytes.buffer);
    return json({ok: true}, 201);
  }
  if (request.method === 'GET') {
    const bytes = await env.FILES.get(key, {type: 'stream'});
    if (bytes === null) throw new HttpError(404, 'Berkas belum tersedia. Coba lagi sebentar.');
    return new Response(bytes, {headers: headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    })});
  }
  if (request.method === 'DELETE') {
    // A retry or connection loss must not remove a file referenced by a committed save.
    if (!await repository.referencesFile(id)) await env.FILES.delete(key);
    return json({ok: true});
  }
  throw new HttpError(405, 'Metode tidak tersedia.');
}

async function api(request, env, url) {
  const publicWorkspace = env.publicWorkspace === true;
  if (!publicWorkspace && (typeof env.TEAM_ACCESS_CODE !== 'string' || env.TEAM_ACCESS_CODE.length < 20)) {
    throw new HttpError(503, 'Kode masuk ruang kerja belum disiapkan.');
  }
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    throw new HttpError(403, 'Permintaan harus berasal dari halaman Smart Audit.');
  }
  const repository = env.workspaceRepository || sqliteWorkspace(env.DB, env.initializeDatabase);
  if (!publicWorkspace) {
    if (url.pathname === '/api/login' && request.method === 'POST') return login(request, env, url, repository);
    if (!await validSession(request, url, env.TEAM_ACCESS_CODE)) throw new HttpError(401, 'Masuk dengan kode tim untuk membuka ruang kerja.');
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      return json({ok: true}, 200, {'Set-Cookie': cookie(url, '', 0)});
    }
  }
  if (url.pathname === '/api/workspace') return workspace(request, repository);
  if (url.pathname.startsWith('/api/files/')) return files(request, env, url.pathname.slice('/api/files/'.length), repository);
  throw new HttpError(404, 'Halaman tidak ditemukan.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (error) {
      if (error instanceof HttpError) return json({error: error.message}, error.status);
      console.error('Smart Audit API request failed', error.name);
      return json({error: 'Server belum dapat memproses permintaan. Coba lagi sebentar.'}, 503);
    }
  }
};
