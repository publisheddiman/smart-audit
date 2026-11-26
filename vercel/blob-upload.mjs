import {put} from '@vercel/blob/client';

window.smartAuditDirectUpload = ({pathname, token}, file) => put(pathname, file, {
  token,
  access: 'private',
  contentType: 'application/octet-stream'
});
