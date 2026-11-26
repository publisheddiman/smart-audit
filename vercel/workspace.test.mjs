import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {privateFiles} from './private-files.mjs';
import {postgresWorkspace} from './postgres-workspace.mjs';
import worker from '../online/worker.mjs';

const site = 'https://smart-audit.vercel.app';

function connect(database) {
  return {
    query(text, params) {
      return {
        text, params,
        then(resolve, reject) {
          return database.query(text, params).then(result => result.rows).then(resolve, reject);
        }
      };
    },
    transaction(statements) {
      return database.transaction(async tx => {
        for (const {text, params} of statements) await tx.query(text, params);
      });
    }
  };
}

test('Vercel opens the shared workspace and files without login', async t => {
  const database = new PGlite();
  t.after(() => database.close());
  const repository = postgresWorkspace(connect(database));
  const files = new Map();
  const env = {
    publicWorkspace: true,
    workspaceRepository: repository,
    FILES: {
      async createUploadToken(key, size) { return {pathname: key, size}; },
      async put(key, bytes) { files.set(key, new Uint8Array(bytes)); },
      async get(key) { return files.get(key) ?? null; },
      async delete(key) { files.delete(key); }
    }
  };
  const fetch = (path, {method = 'GET', data, body, origin = site} = {}) => worker.fetch(
    new Request(site + path, {
      method,
      headers: {Origin: origin},
      body: data === undefined ? body : JSON.stringify(data)
    }),
    env
  );
  const filePath = '/api/files/file-postgres';
  const workspace = await fetch('/api/workspace');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.headers.get('Set-Cookie'), null);
  assert.deepEqual(await workspace.json(), {
    revision: 0, data: {companies: [], regs: null}
  });
  assert.equal((await fetch('/api/login', {method: 'POST'})).status, 404);
  assert.equal((await fetch('/api/logout', {method: 'POST'})).status, 404);
  const tokenResponse = await fetch(filePath + '/upload-token', {method: 'POST'});
  assert.deepEqual(await tokenResponse.json(), {pathname: 'file:file-postgres', size: 10 * 1024 * 1024});
  assert.equal((await fetch(filePath + '/upload-token', {method: 'POST', origin: 'https://elsewhere.test'})).status, 403);
  assert.equal((await fetch(filePath, {method: 'POST', body: 'dokumen contoh'})).status, 201);
  const company = {
    id: 'client-pg', name: 'Klien Vercel Uji', sector: 'BANGUNAN',
    structureFile: {id: 'file-postgres', name: 'Struktur.txt'}, docs: [], managers: [], certs: [], qualif: [],
    audit: {tanggal: '', lingkup: '', metode: ''}, consumption: {}, travel: {business: [], commuting: [], notes: ''},
    recs: [], savings_pct: 0, auditYear: '', auditYears: {}, pendingAudit: null
  };
  const data = {companies: [company], regs: []};
  const update = await fetch('/api/workspace', {method: 'PUT', data: {revision: 0, data}});
  assert.equal(update.status, 200);
  assert.equal((await fetch('/api/workspace', {method: 'PUT', data: {revision: 0, data}})).status, 409);
  assert.deepEqual(await (await fetch('/api/workspace')).json(), {revision: 1, data});
  await fetch(filePath, {method: 'DELETE'});
  assert.equal(await (await fetch(filePath)).text(), 'dokumen contoh');
  await fetch('/api/workspace', {method: 'PUT', data: {revision: 1, data: {companies: [], regs: []}}});
  await fetch(filePath, {method: 'DELETE'});
  assert.equal((await fetch(filePath)).status, 404);
});

test('Blob upload token uses the exact pathname and does not expose the storage secret', async () => {
  const secret = 'vercel_blob_rw_test123_example-secret-for-tests-only';
  const ticket = await privateFiles(secret).createUploadToken('file:sample-001', 10 * 1024 * 1024);
  assert.equal(ticket.pathname, 'smart-audit/sample-001');
  assert.match(ticket.token, /^vercel_blob_client_/);
  assert.ok(!ticket.token.includes(secret));
});
