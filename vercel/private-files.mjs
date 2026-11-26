import {del, get, put} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';

export function privateFiles(token) {
  const location = key => 'smart-audit/' + key.replace('file:', '');
  const options = {token, access: 'private'};
  return {
    async createUploadToken(key, maximumSizeInBytes) {
      const pathname = location(key);
      return {
        pathname,
        token: await generateClientTokenFromReadWriteToken({
          token,
          pathname,
          maximumSizeInBytes,
          validUntil: Date.now() + 5 * 60 * 1000,
          allowedContentTypes: ['application/octet-stream'],
          addRandomSuffix: false,
          allowOverwrite: false
        })
      };
    },
    async put(key, bytes) {
      await put(location(key), new Uint8Array(bytes), {...options, contentType: 'application/octet-stream'});
    },
    async get(key) {
      const result = await get(location(key), options);
      return result?.statusCode === 200 ? result.stream : null;
    },
    async delete(key) {
      await del(location(key), {token});
    }
  };
}
