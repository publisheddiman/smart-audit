import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';

export async function buildFrontend(directory, {extraScripts = [], uploadOrigins = [], publicWorkspace = false} = {}) {
  const source = await readFile(new URL('../smart-audit-live-app.html', import.meta.url), 'utf8');
  const html = source.replace(/\r\n?/g, '\n');
  const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!inlineScript) throw new Error('JavaScript Smart Audit tidak ditemukan.');
  const hash = createHash('sha256').update(inlineScript).digest('base64');
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${hash}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    ["connect-src 'self'", ...uploadOrigins].join(' '),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; ');
  const cloudScript = `<script src="/cloud.js"${publicWorkspace ? ' data-public-workspace' : ''}></script>`;
  const scripts = [...extraScripts.map(src => `<script src="${src}"></script>`), cloudScript].join('\n');
  const hosted = html
    .replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace('<script>', scripts + '\n<script>');
  if (hosted === html || !hosted.includes('src="/cloud.js"')) throw new Error('Halaman online gagal disiapkan.');

  await mkdir(directory, {recursive: true});
  await writeFile(new URL('index.html', directory), hosted);
  await copyFile(new URL('cloud.js', import.meta.url), new URL('cloud.js', directory));
}
