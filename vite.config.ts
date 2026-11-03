import basicSsl from '@vitejs/plugin-basic-ssl';
import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only drop box: POST a file body to /__upload/<name> and it lands in public/character/.
 * Used to pull generated assets straight out of a browser session (Tripo exports) over the LAN.
 * Names are restricted to simple glb/fbx/png file names; nothing else is written.
 */
function uploadDropBox(): Plugin {
  return {
    name: 'upload-drop-box',
    apply: 'serve',
    configureServer(server) {
      // GET /__drop#<url>: a page that fetches that URL in the browser and posts it to /__upload, same origin.
      server.middlewares.use('/__drop', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><meta charset="utf-8"><title>Drop box</title><pre id="o">fetching…</pre><script>
(async () => {
  const o = document.getElementById('o');
  try {
    const src = decodeURIComponent(location.hash.slice(1));
    const name = (new URL(src).pathname.split('/').pop() || 'file.glb').replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
    const r = await fetch(src);
    const b = await r.blob();
    o.textContent = 'got ' + b.size + ' bytes, uploading as ' + name;
    const up = await fetch('/__upload/' + name, { method: 'POST', body: b });
    o.textContent = await up.text();
  } catch (e) { o.textContent = 'error: ' + e; }
})();
</script>`);
      });
      // POST /__note: a short text (such as a download link) saved to scratch/note.txt for the dev machine to use.
      server.middlewares.use('/__note', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync('scratch', { recursive: true });
          writeFileSync('scratch/note.txt', Buffer.concat(chunks).subarray(0, 8192));
          res.end('noted');
        });
      });
      server.middlewares.use('/__upload', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        // Chrome's private-network access check: a public site posting to a LAN address needs this.
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        if (req.method === 'OPTIONS') return void res.end();
        const name = (req.url ?? '').replace(/^\//, '');
        if (req.method !== 'POST' || !/^[a-z0-9-]+\.(glb|fbx|png)$/.test(name)) {
          res.statusCode = 400;
          return void res.end('bad name');
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync('public/character', { recursive: true });
          const buf = Buffer.concat(chunks);
          writeFileSync(`public/character/${name}`, buf);
          res.end(`stored ${name} ${buf.length} bytes`);
        });
      });
    },
  };
}

// HTTPS in dev so getUserMedia works when the page is opened from another machine.
// The certificate is self-signed; accept the browser warning once.
export default defineConfig({
  base: './',
  plugins: [basicSsl(), uploadDropBox()],
  server: { host: true, port: 5180, strictPort: true, cors: false },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
