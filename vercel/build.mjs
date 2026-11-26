import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {buildFrontend} from '../online/frontend.mjs';

const output = new URL('../dist/', import.meta.url);
await buildFrontend(output, {
  publicWorkspace: true,
  extraScripts: ['/blob-upload.js'],
  uploadOrigins: ['https://blob.vercel-storage.com', 'https://*.blob.vercel-storage.com', 'https://vercel.com']
});
await build({
  entryPoints: [fileURLToPath(new URL('./blob-upload.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('blob-upload.js', output)),
  bundle: true,
  platform: 'browser',
  format: 'iife'
});
