import {writeFile} from 'node:fs/promises';
import {buildFrontend} from './frontend.mjs';

export const publicDirectory = new URL('./public/', import.meta.url);
await buildFrontend(publicDirectory);
await writeFile(new URL('_headers', publicDirectory), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: same-origin
`);
