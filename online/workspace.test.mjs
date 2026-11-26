import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLocalStorage} from './local-db.mjs';
import worker from './worker.mjs';

const site = 'https://smart-audit.test';
const code = 'test-only-code-never-deploy';
const company = {
  id: 'client-test', name: 'Klien Uji', sector: 'BANGUNAN',
  jamOperasi: '', deskripsi: '', area_m2: null,
  managers: [], structureFile: null, certs: [], qualif: [], docs: [],
  audit: {tanggal: '', lingkup: '', metode: ''},
  consumption: {},
  travel: {business: [], commuting: [], notes: ''},
  auditYear: '', auditYears: {}, pendingAudit: null,
  recs: [], savings_pct: 0
};

function setup(t) {
  const storage = createLocalStorage(':memory:');
  t.after(() => storage.close());
  const env = {...storage, TEAM_ACCESS_CODE: code};
  const request = (path, {method = 'GET', cookie, json, bytes, origin = site, ip} = {}) => worker.fetch(
    new Request(site + path, {
      method,
      headers: {
        ...(method !== 'GET' ? {Origin: origin} : {}),
        ...(cookie ? {Cookie: cookie} : {}),
        ...(json === undefined ? {} : {'Content-Type': 'application/json'}),
        ...(ip ? {'CF-Connecting-IP': ip} : {})
      },
      ...(json !== undefined ? {body: JSON.stringify(json)} : bytes === undefined ? {} : {body: bytes})
    }),
    env
  );
  async function login(ip) {
    const response = await request('/api/login', {method: 'POST', json: {code}, ip});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('Set-Cookie');
    assert.match(cookie, /HttpOnly; SameSite=Strict; Secure/);
    return cookie.split(';')[0];
  }
  return {request, login};
}

test('unauthenticated sessions cannot read records or files; cross-origin writes fail', async t => {
  const {request, login} = setup(t);
  assert.equal((await request('/api/workspace')).status, 401);
  assert.equal((await request('/api/files/private-file')).status, 401);
  const cookie = await login('192.0.2.1');
  assert.equal((await request('/api/workspace', {cookie: cookie + '0'})).status, 401);
  assert.equal((await request('/api/workspace', {
    method: 'PUT', cookie, origin: 'https://elsewhere.test', json: {}
  })).status, 403);
  assert.match((await request('/api/logout', {method: 'POST', cookie})).headers.get('Set-Cookie'), /Max-Age=0/);
});

test('wrong team codes are throttled', async t => {
  const {request, login} = setup(t);
  const options = {method: 'POST', json: {code: 'bad code'}, ip: '192.0.2.2'};
  for (let i = 0; i < 8; i++) assert.equal((await request('/api/login', options)).status, 401);
  assert.equal((await request('/api/login', options)).status, 429);
  await login('192.0.2.3');
});

test('two sessions share records without silently losing an edit', async t => {
  const {request, login} = setup(t);
  const a = await login('192.0.2.1');
  const b = await login('192.0.2.2');
  const payload = {revision: 0, data: {companies: [company], regs: []}};
  const firstSave = await request('/api/workspace', {method: 'PUT', cookie: a, json: payload});
  assert.deepEqual(await firstSave.json(), {revision: 1});
  const staleEdit = {...payload, data: {companies: [{...company, name: 'Suntingan Lama'}], regs: []}};
  assert.equal((await request('/api/workspace', {method: 'PUT', cookie: b, json: staleEdit})).status, 409);
  const fromB = await (await request('/api/workspace', {cookie: b})).json();
  assert.deepEqual(fromB, {...payload, revision: 1});
  const invalid = {revision: 1, data: {companies: [{...company, sector: 'UNKNOWN'}], regs: []}};
  assert.equal((await request('/api/workspace', {method: 'PUT', cookie: b, json: invalid})).status, 400);
  assert.equal((await (await request('/api/workspace', {cookie: a})).json()).revision, 1);
});

test('attachments are shared privately and their committed references survive cleanup retries', async t => {
  const {request, login} = setup(t);
  const a = await login('192.0.2.1');
  const b = await login('192.0.2.2');
  const filename = '/api/files/file-001';
  assert.equal((await request(filename, {method: 'POST', cookie: a, bytes: 'Isi dokumen audit'})).status, 201);
  const docs = [{name: 'Audit.txt', type: 'Lampiran Lain', year: '2025', file: {id: 'file-001', name: 'Audit.txt'}}];
  const saved = await request('/api/workspace', {
    method: 'PUT', cookie: a, json: {revision: 0, data: {companies: [{...company, docs}], regs: []}}
  });
  assert.equal(saved.status, 200);
  await request(filename, {method: 'DELETE', cookie: a});
  const file = await request(filename, {cookie: b});
  assert.equal(file.headers.get('Content-Disposition'), 'attachment');
  assert.equal(await file.text(), 'Isi dokumen audit');
  await request('/api/workspace', {method: 'PUT', cookie: b, json: {revision: 1, data: {companies: [company], regs: []}}});
  await request(filename, {method: 'DELETE', cookie: a});
  assert.equal((await request(filename, {cookie: b})).status, 404);
});
