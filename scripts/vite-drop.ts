import { appendFileSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';

/** Vite's console is quiet about plugin output; the drop routes keep their own line-per-request log. */
function note(line: string): void {
  try {
    appendFileSync(join(process.cwd(), 'scratch', 'drop.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* no scratch folder: fine */
  }
}
import { basename, join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev-server only: a page at /__drop with a file field, and a POST that writes the file into
 * public/character or public/props. It exists because exports from Tripo land in a browser's Downloads
 * folder on another machine, and the browser can upload them here without anyone finding paths.
 * The folder is fixed to those two, the name is reduced to its base name, and only .glb files are taken.
 */
export function dropPlugin(): Plugin {
  return {
    name: 'listening-kingdom-drop',
    apply: 'serve',
    configureServer(server) {
      // POST a URL (plain text body, with ?folder=&name=) and the server downloads it into the folder. For
      // exports that a page can see the address of but a person would otherwise have to download and copy.
      server.middlewares.use('/__pull', (req, res) => {
        if (req.method !== 'POST') return void (res.statusCode = 405, res.end());
        const q = new URL(req.url ?? '/', 'http://x').searchParams;
        const folder = q.get('folder') === 'props' ? 'props' : 'character';
        const name = basename(q.get('name') ?? 'model.glb').replace(/[^\w.-]+/g, '_');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', async () => {
          const url = Buffer.concat(chunks).toString().trim();
          if (!/^https:\/\//.test(url)) return void (res.statusCode = 400, res.end('https url expected'));
          try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`status ${r.status}`);
            const data = Buffer.from(await r.arrayBuffer());
            const dir = join(process.cwd(), 'public', folder);
            mkdirSync(dir, { recursive: true });
            const out = createWriteStream(join(dir, name));
            out.end(data, () => res.end(`saved public/${folder}/${name} (${data.length} bytes)`));
            console.log(`[drop] pulled public/${folder}/${name} (${data.length} bytes)`);
          } catch (e) {
            console.log(`[drop] pull failed: ${String(e)}`);
            res.statusCode = 502;
            res.end(String(e));
          }
        });
      });
      server.middlewares.use('/__drop', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`<!doctype html><meta charset="utf-8"><title>Drop a model</title>
<body style="font:16px system-ui;background:#15141a;color:#d9d2c4;padding:40px">
<h1>Drop a model</h1>
<form method="post" enctype="multipart/form-data" action="/__drop">
  <p><label>Folder <select name="folder"><option>character</option><option>props</option></select></label></p>
  <p><input type="file" name="file" accept=".glb" required></p>
  <p><button>Upload</button></p>
</form>`);
          return;
        }
        if (req.method !== 'POST') return void (res.statusCode = 405, res.end());
        const type = req.headers['content-type'] ?? '';
        const boundary = /boundary=(.+)$/.exec(type)?.[1];
        if (!boundary) return void (res.statusCode = 400, res.end('multipart expected'));
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          const parts = splitMultipart(body, boundary);
          const folderPart = parts.find((p) => p.name === 'folder');
          const filePart = parts.find((p) => p.name === 'file' && p.filename);
          const folder = folderPart?.data.toString().trim() === 'props' ? 'props' : 'character';
          if (!filePart || !/\.glb$/i.test(filePart.filename ?? '')) return void (note(`rejected: no glb part (${parts.map((p) => p.name + ':' + (p.filename ?? '-')).join(' ')})`), (res.statusCode = 400), res.end('a .glb file is required'));
          const name = basename(filePart.filename!).replace(/[^\w.-]+/g, '_');
          // Only a real glTF binary, and never over an existing file unless ?replace=1 says so.
          note(`drop ${folder}/${name} ${filePart.data.length} bytes head=${JSON.stringify(filePart.data.subarray(0, 4).toString('latin1'))}`);
          if (filePart.data.subarray(0, 4).toString() !== 'glTF') return void (note('rejected: not a glb'), (res.statusCode = 400), res.end('not a glb'));
          const dir = join(process.cwd(), 'public', folder);
          mkdirSync(dir, { recursive: true });
          const replace = new URL(req.url ?? '/', 'http://x').searchParams.get('replace') === '1';
          if (!replace && existsSync(join(dir, name))) return void (note('rejected: exists'), (res.statusCode = 409), res.end('exists'));
          console.log(`[drop] saved public/${folder}/${name} (${filePart.data.length} bytes)`);
          const out = createWriteStream(join(dir, name));
          out.end(filePart.data, () => {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`saved public/${folder}/${name} (${filePart.data.length} bytes)`);
          });
        });
      });
    },
  };
}

function splitMultipart(body: Buffer, boundary: string): Array<{ name: string; filename?: string; data: Buffer }> {
  const sep = Buffer.from(`--${boundary}`);
  const parts: Array<{ name: string; filename?: string; data: Buffer }> = [];
  let pos = body.indexOf(sep);
  while (pos >= 0) {
    const start = pos + sep.length;
    if (body.slice(start, start + 2).toString() === '--') break;
    const next = body.indexOf(sep, start);
    const chunk = body.slice(start + 2, next >= 0 ? next - 2 : body.length); // skip CRLF after the boundary and before the next
    const headerEnd = chunk.indexOf('\r\n\r\n');
    const headers = chunk.slice(0, headerEnd).toString();
    const data = chunk.slice(headerEnd + 4);
    const name = /name="([^"]*)"/.exec(headers)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    parts.push({ name, filename, data });
    pos = next;
  }
  return parts;
}
