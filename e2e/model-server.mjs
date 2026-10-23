// Tiny static server for the opt-in real-Kokoro test: serves a local model
// folder at <host>/<model-id>/resolve/main/<file>, with CORS.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

export function serveModel(dir, modelId, port) {
  const server = createServer((req, res) => {
    const prefix = `/${modelId}/resolve/main/`;
    const path = decodeURIComponent((req.url ?? '').split('?')[0]);
    const file = path.startsWith(prefix) ? join(dir, path.slice(prefix.length)) : '';
    res.setHeader('access-control-allow-origin', '*');
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-length': statSync(file).size, 'content-type': 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Serves a folder as-is at http://localhost:<port>/ (with CORS), e.g. Piper voice files. */
export function serveDir(dir, port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0]);
    const file = join(dir, path);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cross-origin-resource-policy', 'cross-origin');
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-length': statSync(file).size, 'content-type': 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
