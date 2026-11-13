// Local relay: receives hook events (POST /events), keeps agent state, streams it to the browser (SSE /stream), serves the 3D app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toNeutral, applyEvent } from './relay.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TAMBANG_PORT) || 8787;
const HOST = '127.0.0.1'; // NFR-01: never bind to the network
const TOKEN_FILE = path.join(ROOT, '.tambang-token');
if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(24).toString('hex'));
const TOKEN = Buffer.from(fs.readFileSync(TOKEN_FILE, 'utf8').trim());

const agents = new Map();
const clients = new Set();
const snapshot = () => `data: ${JSON.stringify([...agents.values()])}\n\n`;
const broadcast = () => { const s = snapshot(); for (const res of clients) res.write(s); };

const STATIC = {
  '/': path.join(ROOT, 'public'),
  '/vendor/three/': path.join(ROOT, 'node_modules', 'three'),
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function authorized(req) {
  const got = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  return got.length === TOKEN.length && crypto.timingSafeEqual(got, TOKEN);
}

function serveStatic(req, res, url) {
  const prefix = url.startsWith('/vendor/three/') ? '/vendor/three/' : '/';
  const dir = STATIC[prefix];
  let file;
  try { file = path.normalize(path.join(dir, decodeURIComponent(url.slice(prefix.length)) || 'index.html')); } catch { return res.writeHead(400).end(); }
  if (!file.startsWith(dir + path.sep) ||!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  // DNS-rebinding guard: only accept requests addressed to this machine
  if (!new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`).test(req.headers.host || '')) return res.writeHead(403).end();
  const url = req.url.split('?')[0];

  if (req.method === 'POST' && url === '/events') {
    if (!authorized(req)) return res.writeHead(401).end(); // NFR-02
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1e6) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      let e;
      try { e = toNeutral(JSON.parse(Buffer.concat(chunks))); } catch { return res.writeHead(400).end(); }
      res.writeHead(204).end();
      if (!e) return;
      const a = applyEvent(agents, e);
      if (!a) return;
      console.log(new Date(e.ts).toLocaleTimeString(), e.event.padEnd(14), (e.tool || '').padEnd(10), a.name.padEnd(20), `+${Date.now() - e.ts} ms`);
      if (a.state === 'leaving') setTimeout(() => {
        for (const [id, x] of agents) if (x.state === 'leaving' && (id === a.id || x.parent === a.id)) agents.delete(id);
        broadcast();
      }, 12000);
      broadcast();
    });
    return;
  }

  if (req.method === 'GET' && url === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(snapshot());
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'GET') return serveStatic(req, res, url);
  res.writeHead(405).end();
});

setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);
// Sessions killed without SessionEnd (closed terminal) would sleep in the mess forever; drop them after 12 h of no state change.
setInterval(() => {
  const old = Date.now() - 12 * 3600e3;
  let gone = 0;
  for (const [id, a] of agents) if (a.since < old) { agents.delete(id); gone++; }
  if (gone) broadcast();
}, 10 * 60e3);
server.listen(PORT, HOST, () => console.log(`Tambang Agent jalan di http://${HOST}:${PORT}`));
