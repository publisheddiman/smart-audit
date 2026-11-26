import {neon} from '@neondatabase/serverless';
import worker from '../online/worker.mjs';
import {privateFiles} from '../vercel/private-files.mjs';
import {postgresWorkspace} from '../vercel/postgres-workspace.mjs';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/smart-audit') {
      const route = url.searchParams.get('route') || '';
      if (!/^(workspace|files\/[a-zA-Z0-9-]+(?:\/upload-token)?)$/.test(route)) {
        return new Response(null, {status: 404});
      }
      url.pathname = '/api/' + route;
      url.search = '';
      request = new Request(url, request);
    }
    const {DATABASE_URL, BLOB_READ_WRITE_TOKEN} = process.env;
    if (!DATABASE_URL || !BLOB_READ_WRITE_TOKEN) {
      return Response.json({error: 'Database atau penyimpanan Vercel belum disiapkan.'}, {
        status: 503, headers: {'Cache-Control': 'no-store'}
      });
    }
    return worker.fetch(request, {
      workspaceRepository: postgresWorkspace(neon(DATABASE_URL)),
      FILES: privateFiles(BLOB_READ_WRITE_TOKEN),
      publicWorkspace: true
    });
  }
};
