// PT Maul's Corp — Tambang Agent relay.
// Satu-satunya bagian yang tahu arti event: hook Claude Code / webhook generik -> state per agent -> SSE ke browser.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const PUB = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1'; // NFR-01: lokal saja; HP lewat `tailscale serve`
const IDLE_GYM = (+process.env.IDLE_GYM_MIN || 5) * 60e3;
const IDLE_MESS = (+process.env.IDLE_MESS_MIN || 30) * 60e3;
const SIM_SCALE = 1 / 40; // demo: 5 menit -> 7,5 detik, 30 menit -> 45 detik
const NTFY = process.env.NTFY_TOPIC ? `${(process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '')}/${process.env.NTFY_TOPIC}` : null;

export const EVENTS = new Set(['session_start', 'prompt', 'tool_start', 'tool_end', 'tool_error', 'needs_input', 'turn_end',
  'subagent_start', 'subagent_end', 'compact', 'api_error', 'session_end']);
export const agents = new Map();
export const world = { day: dayKey(Date.now()), apelDay: null, apelUntil: 0, onWaiting: null, names: {} };

function dayKey(ms) { return new Date(ms).toLocaleDateString('sv'); }
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

export function toolZone(t = '') {
  if (/^(Bash|PowerShell|BashOutput|KillShell|KillBash|Monitor)$/.test(t)) return 'bash';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(t)) return 'edit';
  if (/^(Read|Grep|Glob|LS|LSP|NotebookRead)$/.test(t)) return 'read';
  if (/^(WebSearch|WebFetch)$/.test(t) || /^mcp__.*(fetch|browser|playwright|search)/i.test(t)) return 'web';
  if (/^(Agent|Task)$/.test(t)) return 'delegate';
  return 'think';
}

// --- Adapter: payload hook Claude Code -> event netral v1. tool_input dibuang di sini (NFR-03).
const HOOK = {
  SessionStart: 'session_start', UserPromptSubmit: 'prompt', PreToolUse: 'tool_start', PostToolUse: 'tool_end',
  PostToolUseFailure: 'tool_error', PermissionRequest: 'needs_input', Stop: 'turn_end', StopFailure: 'api_error',
  SubagentStart: 'subagent_start', SubagentStop: 'subagent_end', PreCompact: 'compact', SessionEnd: 'session_end',
};
export function fromClaude(p) {
  let event = HOOK[p.hook_event_name];
  // idle_prompt = Claude selesai & diam; itu idle (kantin/gym/mess), bukan "menunggu izin"
  if (p.hook_event_name === 'Notification') event = /permission|elicitation/.test(p.notification_type || '') ? 'needs_input' : null;
  if (!event || typeof p.session_id !== 'string') return null;
  if (p.tool_name === 'AskUserQuestion' && event === 'tool_start') event = 'needs_input';
  const sub = typeof p.agent_id === 'string' && p.agent_id;
  return {
    v: 1, source: 'claude-code', event,
    agent_id: sub ? `${p.session_id}:${p.agent_id}` : p.session_id,
    parent_id: sub ? p.session_id : null,
    name: sub ? (p.agent_type || 'subagent') : String(p.cwd || 'agent').split(/[\\/]/).filter(Boolean).pop(),
    tool: p.tool_name || null,
    transcript: p.agent_transcript_path || (sub ? null : p.transcript_path) || null, // dipakai sekali untuk tonase, tidak disimpan
  };
}

// --- Event netral dari sumber lain (n8n, script) — FR-15. Validasi di batas kepercayaan.
export function fromGeneric(b) {
  const str = (v, n) => (typeof v === 'string' && v.length <= n ? v : null);
  if (!EVENTS.has(b.event) || !str(b.agent_id, 120)) return null;
  return { v: 1, source: str(b.source, 40) || 'custom', event: b.event, agent_id: b.agent_id,
    parent_id: str(b.parent_id, 120), name: str(b.name, 40) || b.agent_id.slice(0, 12), tool: str(b.tool, 60), transcript: null };
}

function setState(a, s, now) { if (a.state !== s) { a.state = s; a.since = now; } }
function uniqueName(base, id) {
  let n = base, i = 2;
  while ([...agents.values()].some(o => o.id !== id && o.name === n)) n = `${base} #${i++}`;
  return n;
}
function spawn(ev, now) {
  const a = {
    id: ev.agent_id, parent: ev.parent_id || null, source: ev.source, sim: ev.agent_id.startsWith('sim:'),
    name: '', state: 'p2h', since: now, until: now + (ev.parent_id ? 2500 : 4000), idleSince: now,
    tool: null, ritase: 0, tonase: 0, born: now, log: [],
  };
  a.name = uniqueName(world.names[a.id] || ev.name || 'agent', a.id);
  agents.set(a.id, a);
  return a;
}
function leave(a, now) { setState(a, 'leaving', now); a.until = now + 6000; }

export function applyEvent(ev, now = Date.now()) {
  rollDay(now);
  let a = agents.get(ev.agent_id);
  if (ev.event === 'session_end' || ev.event === 'subagent_end') {
    if (!a) return null;
    a.log.push({ t: now, e: ev.event });
    leave(a, now);
    for (const c of agents.values()) if (c.parent === a.id) leave(c, now);
    return a;
  }
  if (!a) a = spawn(ev, now);
  const was = a.state;
  a.last = now;
  a.log.push({ t: now, e: ev.event, tool: ev.tool || undefined });
  if (a.log.length > 40) a.log.shift();
  switch (ev.event) {
    case 'session_start':
      a.until = now + 4000; setState(a, 'p2h', now);
      if (!a.sim && world.apelDay !== world.day) { world.apelDay = world.day; world.apelUntil = now + 12000; } // FR-17: sekali per hari
      break;
    case 'subagent_start': break; // spawn sudah memberi P2H singkat
    case 'prompt': a.until = 0; setState(a, 'think', now); break;
    case 'tool_start': a.until = 0; a.tool = ev.tool; setState(a, toolZone(ev.tool), now); break;
    case 'tool_end': a.ritase++; a.until = 0; setState(a, 'think', now); break;
    case 'tool_error': a.ritase++; setState(a, 'error', now); a.until = now + 4000; break;
    case 'needs_input': a.until = 0; if (ev.tool) a.tool = ev.tool; setState(a, 'waiting', now); break;
    case 'turn_end': a.until = 0; a.idleSince = now; setState(a, 'kantin', now); break;
    case 'compact': setState(a, 'compact', now); a.until = now + 6000; break;
    case 'api_error': a.until = 0; a.idleSince = now; setState(a, 'rain', now); break;
  }
  if (a.state === 'waiting' && was !== 'waiting') world.onWaiting?.(a);
  return a;
}

export function idleZone(a, now) {
  const s = a.sim ? SIM_SCALE : 1, d = now - a.idleSince;
  return d < IDLE_GYM * s ? 'kantin' : d < IDLE_MESS * s ? (hash(a.id) % 2 ? 'gym' : 'taman') : 'mess';
}
const IDLE = new Set(['kantin', 'gym', 'taman', 'mess']);

// Timer: transisi sementara (P2H, workshop, pulang) + perpindahan zona idle. Return true kalau ada perubahan.
export function tick(now = Date.now()) {
  let changed = rollDay(now);
  for (const a of agents.values()) {
    if (a.until && now >= a.until) {
      a.until = 0; changed = true;
      if (a.state === 'leaving') { agents.delete(a.id); continue; }
      if (a.state === 'p2h' && !a.parent) { a.idleSince = now; setState(a, 'kantin', now); } else setState(a, 'think', now);
    }
    if (IDLE.has(a.state)) { const z = idleZone(a, now); if (z !== a.state) { setState(a, z, now); changed = true; } }
  }
  return changed;
}
function rollDay(now) {
  const k = dayKey(now);
  if (k === world.day) return false;
  world.day = k; // FR-13: papan produksi reset tengah malam
  for (const a of agents.values()) { a.ritase = 0; a.tonase = 0; }
  return true;
}

export function snapshot(now = Date.now()) {
  return {
    now, day: world.day, apelUntil: world.apelUntil,
    agents: [...agents.values()].map(({ id, parent, name, state, tool, since, ritase, tonase, sim, born, log, source }) =>
      ({ id, parent, name, state, tool, since, ritase, tonase, sim, born, log, source })),
  };
}

// Tonase = token hari ini dari transkrip lokal (dedupe per message.id karena satu respons bisa tertulis beberapa baris).
export async function todayTokens(file, now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0), seen = new Set();
  let n = 0;
  for (const line of (await fs.promises.readFile(file, 'utf8')).split('\n')) {
    if (!line.includes('"usage"')) continue;
    try {
      const j = JSON.parse(line), m = j.message, u = m?.usage;
      if (!u || seen.has(m.id) || Date.parse(j.timestamp) < start) continue;
      seen.add(m.id);
      n += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0);
    } catch { /* baris rusak / sedang ditulis */ }
  }
  return n;
}
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
function safeTranscript(f) { // hanya file .jsonl di ~/.claude, walau payload sudah lolos token
  if (!f) return null;
  const r = path.resolve(f);
  return r.startsWith(CLAUDE_DIR + path.sep) && r.endsWith('.jsonl') ? r : null;
}

// --- Simulator (FR-12): agent palsu `sim:*`, bisa direkam tanpa Claude Code dan tanpa data asli.
const SIM_NAMES = { s1: 'api-refactor', s2: 'landing-page', s3: 'data-pipeline', s4: 'bot-wa', s5: 'laporan-q4', 's5:x1': 'Explore', 's5:x2': 'code-reviewer' };
const SIM = [
  [0, 's1', 'session_start'], [0.4, 's2', 'session_start'], [0.8, 's3', 'session_start'], [1.2, 's4', 'session_start'], [1.6, 's5', 'session_start'],
  [13, 's1', 'prompt'], [14, 's1', 'tool_start', 'Bash'], [13.5, 's2', 'prompt'], [14.5, 's2', 'tool_start', 'Edit'],
  [14, 's3', 'prompt'], [15, 's3', 'tool_start', 'Grep'], [14.5, 's4', 'prompt'], [15.5, 's4', 'tool_start', 'WebSearch'],
  [15, 's5', 'prompt'], [16, 's5', 'tool_start', 'Agent'], [17, 's5:x1', 'subagent_start'], [17.6, 's5:x2', 'subagent_start'],
  [20, 's5:x1', 'tool_start', 'Read'], [20.5, 's5:x2', 'tool_start', 'Bash'],
  [21, 's2', 'tool_end'], [21.5, 's2', 'needs_input', 'Bash'],
  [23, 's3', 'tool_end'], [23.5, 's3', 'tool_start', 'Read'], [26, 's3', 'tool_error'],
  [27, 's4', 'tool_end'], [28, 's4', 'turn_end'],
  [29, 's1', 'tool_end'], [29.5, 's1', 'tool_start', 'Write'],
  [33, 's3', 'compact'], [34, 's2', 'tool_end'], [34.5, 's2', 'tool_start', 'Bash'],
  [37, 's5:x1', 'subagent_end'], [38, 's5:x2', 'subagent_end'], [38.5, 's5', 'tool_end'], [39, 's5', 'tool_start', 'Edit'],
  [42, 's1', 'api_error'], [44, 's3', 'tool_start', 'WebFetch'],
  [55, 's1', 'prompt'], [56, 's1', 'tool_start', 'Bash'], [58, 's2', 'tool_end'], [59, 's2', 'turn_end'],
  [62, 's3', 'tool_end'], [62.5, 's3', 'needs_input', 'Edit'], [70, 's3', 'tool_end'], [70.5, 's3', 'tool_start', 'Edit'],
  [74, 's5', 'tool_end'], [75, 's5', 'turn_end'], [84, 's1', 'tool_end'], [84.5, 's1', 'turn_end'], [86, 's3', 'turn_end'],
  [100, 's1', 'session_end'], [100.5, 's2', 'session_end'], [101, 's3', 'session_end'], [101.5, 's4', 'session_end'], [102, 's5', 'session_end'],
];
let simTimers = [];
export const simOn = () => simTimers.length > 0;
export function startSim(emit) {
  stopSim();
  world.apelUntil = Date.now() + 11000;
  for (const [sec, k, event, tool] of SIM) simTimers.push(setTimeout(() => {
    const sub = k.includes(':');
    emit({ v: 1, source: 'sim', event, agent_id: `sim:${k}`, parent_id: sub ? `sim:${k.split(':')[0]}` : null, name: SIM_NAMES[k], tool, transcript: null });
  }, sec * 1000));
  simTimers.push(setInterval(() => { // denyut produksi: alat yang sedang jalan menambah ritase & tonase
    for (const a of agents.values()) if (a.sim && ['bash', 'edit', 'read', 'web'].includes(a.state) && Math.random() < 0.4) {
      a.ritase++; a.tonase += 800 + Math.floor(Math.random() * 4000);
    }
  }, 2500));
  simTimers.push(setTimeout(() => startSim(emit), 110000)); // putar ulang
}
export function stopSim() {
  simTimers.forEach(t => { clearTimeout(t); clearInterval(t); });
  simTimers = [];
  for (const a of agents.values()) if (a.sim) agents.delete(a.id);
}

// --- HTTP
function readBody(req, limit = 8e6) {
  return new Promise((res, rej) => {
    const chunks = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > limit) { rej(new Error('too large')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}
export function authOk(header, token) {
  const got = Buffer.from(String(header || '').replace(/^Bearer\s+/i, '')), want = Buffer.from(token);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
// Header kustom memaksa preflight CORS yang tidak kita jawab -> halaman web lain tidak bisa memicu aksi ini (tetap jalan di balik proxy Tailscale).
const fromOwnPage = req => req.headers['x-tambang'] === '1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function createServer(token) {
  const clients = new Set();
  let pending = false;
  const broadcast = () => {
    if (pending) return; pending = true;
    setImmediate(() => { pending = false; const msg = `data: ${JSON.stringify({ ...snapshot(), sim: simOn() })}\n\n`; for (const c of clients) c.write(msg); });
  };
  const ingest = ev => {
    const a = applyEvent(ev);
    broadcast();
    const file = safeTranscript(ev.transcript);
    if (a && file && (ev.event === 'turn_end' || ev.event === 'subagent_end')) {
      todayTokens(file).then(n => { a.tonase = n; broadcast(); }).catch(() => {});
    }
  };
  const timer = setInterval(() => { if (tick()) broadcast(); }, 1000);
  const ping = setInterval(() => { for (const c of clients) c.write('event: ping\ndata: 1\n\n'); }, 20000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'POST' && url.pathname === '/events') {
        if (!authOk(req.headers.authorization, token)) { res.writeHead(401).end(); return; } // NFR-02
        const body = JSON.parse(await readBody(req));
        res.writeHead(200).end(); // body kosong: hook tidak pernah ikut memutuskan izin
        const ev = body.hook_event_name ? fromClaude(body) : fromGeneric(body);
        if (ev) ingest(ev);
        return;
      }
      if (req.method === 'POST' && (url.pathname === '/rename' || url.pathname === '/sim')) {
        if (!fromOwnPage(req)) { res.writeHead(403).end(); return; }
        const body = JSON.parse(await readBody(req, 4096) || '{}');
        if (url.pathname === '/sim') body.on ? startSim(ingest) : stopSim();
        else {
          const a = agents.get(body.id), name = String(body.name || '').trim().slice(0, 32);
          if (!a || !name) { res.writeHead(400).end(); return; }
          a.name = uniqueName(name, a.id);
          if (!a.sim) { world.names[a.id] = a.name; fs.writeFileSync(path.join(DATA, 'names.json'), JSON.stringify(world.names, null, 1)); }
        }
        broadcast(); res.writeHead(204).end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ ...snapshot(), sim: simOn() })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'GET') {
        const file = path.join(PUB, url.pathname === '/' ? 'index.html' : path.normalize(decodeURIComponent(url.pathname)));
        if (!file.startsWith(PUB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('404'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(405).end();
    } catch {
      if (!res.headersSent) res.writeHead(400).end();
    }
  });
  server.on('close', () => { clearInterval(timer); clearInterval(ping); stopSim(); });
  return server;
}

// --- ntfy (FR-09): isi hanya nama + status, tanpa perintah/path.
function notify(a) {
  if (!NTFY || a.sim) return;
  fetch(NTFY, { method: 'POST', body: `${a.name} butuh izin`, headers: { Title: "PT Maul's Corp - Pos STOP", Tags: 'rotating_light', Priority: 'high' }, signal: AbortSignal.timeout(5000) })
    .catch(e => console.warn('ntfy gagal:', e.message));
}

export function loadToken() {
  fs.mkdirSync(DATA, { recursive: true });
  if (process.env.TAMBANG_TOKEN) return process.env.TAMBANG_TOKEN;
  const f = path.join(DATA, 'token.txt');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(24).toString('hex'));
  return fs.readFileSync(f, 'utf8').trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = loadToken();
  try { world.names = JSON.parse(fs.readFileSync(path.join(DATA, 'names.json'), 'utf8')); } catch { /* belum ada */ }
  world.onWaiting = notify;
  createServer(token).listen(PORT, HOST, () => {
    console.log(`\n  ⛏  PT MAUL'S CORP — TAMBANG AGENT`);
    console.log(`  Buka: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  Hook: ${fs.existsSync(path.join(os.homedir(), '.claude', 'settings.json')) && fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8').includes(`:${PORT}/events`) ? 'terpasang' : 'BELUM — jalankan: npm run install-hooks'}`);
    console.log(`  ntfy: ${NTFY ? 'aktif' : 'mati (set NTFY_TOPIC untuk notifikasi HP)'}\n`);
  });
}
