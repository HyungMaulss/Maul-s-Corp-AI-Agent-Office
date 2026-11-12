'use strict';
// PT Maul's Corp — Tambang Agent (browser). Hanya menggambar state dari relay; tidak menebak arti event.
const $ = s => document.querySelector(s);
const cv = $('#cv');
let ctx = cv.getContext('2d');
const W = 360, H = 600;
const MONO = 'ui-monospace, Consolas, monospace', EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

const S = {
  waiting: { label: 'Menunggu Anda', icon: '!', color: '#facc15', zone: 'Pos STOP di gerbang', kind: 'wait' },
  bash: { label: 'Menjalankan perintah', icon: '⛏️', color: '#f97316', zone: 'Beko di front pit', kind: 'work' },
  edit: { label: 'Menulis / edit file', icon: '🚚', color: '#fb923c', zone: 'Dump truck di hauling road (1 file = 1 ritase)', kind: 'work' },
  read: { label: 'Membaca / mencari kode', icon: '🔍', color: '#22d3ee', zone: 'Pos survei di bench 1', kind: 'work' },
  web: { label: 'Riset web', icon: '📡', color: '#60a5fa', zone: 'Menara radio', kind: 'work' },
  think: { label: 'Merencanakan', icon: '💭', color: '#e5e5e5', zone: 'Kantor, papan mine plan', kind: 'work' },
  delegate: { label: 'Mendelegasikan subagent', icon: '👥', color: '#a3e635', zone: 'Pintu mess, kru baru keluar', kind: 'work' },
  p2h: { label: 'P2H, cek alat', icon: '📋', color: '#fde68a', zone: 'Workshop (agent baru)', kind: 'work' },
  error: { label: 'Error tool', icon: '🔧', color: '#ef4444', zone: 'Workshop, alat berasap', kind: 'work' },
  compact: { label: 'Kompaksi konteks', icon: '🛢️', color: '#d4a373', zone: 'Workshop, ganti oli', kind: 'work' },
  rain: { label: 'Rain stop (rate limit / API error)', icon: '🌧️', color: '#93c5fd', zone: 'Berteduh di kantin, hujan di pit', kind: 'idle' },
  kantin: { label: 'Idle, ngopi', icon: '☕', color: '#a8a29e', zone: 'Kantin (0–5 menit)', kind: 'idle' },
  gym: { label: 'Idle, angkat beban', icon: '🏋️', color: '#a8a29e', zone: 'Gym (5–30 menit)', kind: 'idle' },
  taman: { label: 'Idle, jalan santai', icon: '🌳', color: '#a8a29e', zone: 'Taman (5–30 menit)', kind: 'idle' },
  mess: { label: 'Idle, tidur', icon: '💤', color: '#78716c', zone: 'Mess (>30 menit)', kind: 'idle' },
  leaving: { label: 'Pulang', icon: '🚌', color: '#78716c', zone: 'Bus karyawan keluar gerbang', kind: 'idle' },
};
const ZONE_OF = { waiting: 'stop', web: 'radio', think: 'kantor', p2h: 'workshop', error: 'workshop', compact: 'workshop', kantin: 'kantin', rain: 'kantin',
  gym: 'gym', taman: 'taman', mess: 'mess', delegate: 'messdoor', edit: 'road', read: 'bench1', bash: 'bench2', leaving: 'gate' };
const EVL = { session_start: 'Masuk shift, P2H', prompt: 'Instruksi baru', tool_start: 'Mulai alat', tool_end: 'Selesai, +1 ritase', tool_error: 'Alat rusak',
  needs_input: 'Minta izin di Pos STOP', turn_end: 'Istirahat', subagent_start: 'Kru turun dari mess', subagent_end: 'Kru pulang', compact: 'Ganti oli (kompaksi)',
  api_error: 'Rain stop', session_end: 'Pulang' };
const HELMETS = ['#facc15', '#f97316', '#22c55e', '#3b82f6', '#ef4444', '#22d3ee', '#a3e635', '#f472b6'];
const PSEUDO = ['Ucok', 'Asep', 'Joko', 'Komang', 'Bambang', 'Yanto', 'Dedi', 'Wayan', 'Rudi', 'Agus', 'Bayu', 'Eko', 'Slamet', 'Togar', 'Made', 'Udin'];
const meta = a => S[a.state] || S.think;

const store = { get: k => { try { return localStorage.getItem('tambang.' + k) === '1'; } catch { return false; } },
  set: (k, v) => { try { localStorage.setItem('tambang.' + k, v ? '1' : '0'); } catch { /* mode privat */ } } };
let snap = { agents: [], apelUntil: 0, sim: false, now: Date.now() }, skew = 0, sel = null, lastMsg = 0, offSince = 0;
let content = store.get('content'), sound = store.get('sound');
const pos = new Map(), pseudo = new Map(), prevRit = new Map(), floats = [];
let prevWaiting = new Set();

const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const srvNow = () => Date.now() + skew;
const visible = () => snap.agents.filter(a => !!a.sim === !!snap.sim); // demo menyembunyikan agent asli (aman direkam)
const helmetOf = a => a.parent ? '#ffffff' : HELMETS[hash(a.id) % HELMETS.length];
function nameOf(a) {
  if (!content) return a.name;
  if (!pseudo.has(a.id)) pseudo.set(a.id, a.parent ? `Kru ${String.fromCharCode(65 + pseudo.size % 26)}` : `Op. ${PSEUDO[pseudo.size % PSEUDO.length]}`);
  return pseudo.get(a.id);
}
function dur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}j ${String(m % 60).padStart(2, '0')}m`;
}
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);

// ---------- drawing helpers
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function circle(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function txt(s, x, y, size, c, align = 'left', weight = 700, font = MONO) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = c; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
}
function line(pts, c, w = 1) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
function poly(pts, c) { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); }

// ---------- static background (cached per jam & ukuran: hemat baterai)
let bg = null, bgKey = '';
function skyFor(h) {
  if (h >= 7 && h < 16) return { sky: '#0d1d29', hill: '#0a1410', light: '#1e3a4a', night: false };
  if (h >= 16 && h < 18) return { sky: '#2a1508', hill: '#140b06', light: '#7c4a1e', night: false };
  if (h >= 5 && h < 7) return { sky: '#1a1424', hill: '#0d0a12', light: '#3b3350', night: false };
  return { sky: '#03050b', hill: '#050607', light: '#fcd34d', night: true };
}
function drawBg(g) {
  const prev = ctx; ctx = g;
  const hr = new Date().getHours(), P = skyFor(hr);
  rect(0, 0, W, H, '#020202');
  rect(0, 0, W, 100, P.sky);
  if (P.night) for (let i = 0; i < 40; i++) rect((i * 89) % W, (i * 37) % 70, 1, 1, i % 3 ? '#9ca3af' : '#fff');
  if (P.night) circle(250, 22, 8, '#e5e7eb'), circle(253, 20, 7, P.sky); else circle(250, 24, 9, hr >= 16 ? '#f97316' : '#fde68a');
  poly([[0, 100], [0, 74], [40, 62], [90, 76], [150, 58], [210, 72], [270, 54], [320, 70], [360, 60], [360, 100]], P.hill);
  // terasering camp
  rect(0, 100, W, 170, '#0f0c09');
  for (const y of [100, 185, 270]) { rect(0, y, W, 4, '#6b5a45'); rect(0, y + 4, W, 2, '#2b2118'); }
  // gerbang Maul's Corp
  rect(6, 56, 5, 44, '#78716c'); rect(50, 56, 5, 44, '#78716c');
  rect(2, 46, 58, 15, '#facc15'); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.strokeRect(3, 47, 56, 13);
  txt("MAUL'S CORP", 31, 57, 7.5, '#000', 'center', 900);
  // pos STOP
  rect(62, 76, 26, 24, '#d4d4d4'); rect(60, 72, 30, 4, '#ef4444'); rect(66, 80, 12, 8, P.light); txt('POS', 75, 97, 5.5, '#111', 'center', 900);
  rect(103, 72, 2, 28, '#a3a3a3');
  const oct = []; for (let i = 0; i < 8; i++) oct.push([104 + 7 * Math.cos(Math.PI / 8 + i * Math.PI / 4), 67 + 7 * Math.sin(Math.PI / 8 + i * Math.PI / 4)]);
  poly(oct, '#dc2626'); txt('STOP', 104, 68.8, 4.6, '#fff', 'center', 900);
  // menara radio
  line([[316, 100], [324, 24], [332, 100]], '#a3a3a3', 1.5); line([[336, 100], [326, 24]], '#a3a3a3', 1);
  for (let y = 30; y < 100; y += 10) line([[324 - (y - 24) * 0.1, y], [326 + (y - 24) * 0.13, y + 5]], '#6b7280', 0.8);
  rect(325, 10, 2, 14, '#d4d4d4');
  // kantor tambang
  rect(8, 146, 118, 39, '#1f2937'); rect(4, 140, 126, 6, '#9ca3af'); txt('KANTOR TAMBANG', 67, 145, 5.5, '#111', 'center', 900);
  rect(14, 163, 11, 22, '#0a0a0a'); rect(34, 150, 62, 28, '#e5e7eb'); rect(36, 152, 58, 24, '#0f172a');
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 0.8;
  for (let r = 3; r < 12; r += 3) { ctx.beginPath(); ctx.ellipse(62, 164, r * 2.2, r, 0, 0, Math.PI * 2); ctx.stroke(); }
  txt('MINE PLAN', 65, 174.5, 4, '#facc15', 'center'); rect(102, 152, 18, 12, P.light);
  // workshop
  rect(138, 148, 90, 37, '#27272a'); rect(134, 142, 98, 6, '#f59e0b'); txt('WORKSHOP', 183, 147, 5.5, '#111', 'center', 900);
  rect(144, 154, 78, 31, '#0a0a0a'); for (let x = 144; x < 222; x += 8) rect(x, 154, 4, 3, '#facc15');
  for (let x = 196; x < 218; x += 5) rect(x, 162, 2, 8, '#52525b');
  // lapangan apel + bendera
  rect(343, 126, 2, 59, '#d4d4d4'); rect(345, 127, 14, 5, '#ef4444'); rect(345, 132, 14, 5, '#f5f5f5');
  rect(322, 177, 16, 8, '#44403c'); rect(238, 182, 80, 1, '#57534e');
  // kantin
  rect(8, 238, 82, 32, '#292524'); for (let x = 4; x < 94; x += 9) rect(x, 232, 9, 6, (x / 9) % 2 < 1 ? '#ef4444' : '#f5f5f5');
  rect(8, 256, 82, 4, '#78350f'); rect(72, 242, 10, 14, '#525252'); rect(74, 245, 6, 3, P.light); txt('KANTIN', 40, 250, 6, '#fbbf24', 'center', 900);
  // gym
  rect(98, 236, 72, 34, '#1c1917'); rect(95, 231, 78, 5, '#22c55e'); rect(102, 242, 64, 28, '#0c0a09'); txt('GYM', 134, 250, 6, '#22c55e', 'center', 900);
  for (let x = 150; x < 164; x += 5) rect(x, 256, 3, 10, '#57534e');
  // taman
  rect(176, 266, 76, 4, '#3f6212');
  for (const [x, r] of [[184, 10], [236, 12]]) { rect(x - 1.5, 270 - 22, 3, 22, '#78350f'); circle(x, 270 - 24, r, '#166534'); circle(x + 4, 270 - 28, r * 0.6, '#15803d'); }
  rect(206, 262, 18, 2, '#a16207'); for (let x = 196; x < 248; x += 7) circle(x, 266, 1.2, x % 2 ? '#f472b6' : '#fde047');
  // mess (penampang: kelihatan ranjang)
  rect(256, 226, 96, 44, '#1f2937'); rect(252, 220, 104, 6, '#3b82f6'); txt('MESS KARYAWAN', 304, 225, 5.5, '#fff', 'center', 900);
  rect(268, 230, 80, 38, '#0b1220'); rect(270, 246, 76, 2, '#78716c'); rect(270, 258, 76, 2, '#78716c');
  for (let x = 270; x < 348; x += 19) rect(x, 230, 1.5, 38, '#334155');
  rect(258, 248, 8, 22, '#0a0a0a');
  // penampang tanah & pit
  rect(0, 276, W, H - 276, '#33241a');
  for (const [y, h, c] of [[330, 30, '#3b2a1d'], [400, 30, '#2c1f15'], [452, 9, '#0b0b0b'], [500, 30, '#3a2a1f'], [548, 18, '#050505'], [566, 34, '#1c1611']]) rect(0, y, W, h, c);
  for (let i = 0; i < 26; i++) rect((i * 53) % W, 550 + (i * 7) % 14, 2, 1, '#a3a3a3'); // kilap batubara
  const VOID = [[14, 290], [346, 290], [346, 314], [322, 314], [322, 394], [284, 394], [284, 474], [246, 474], [246, 542],
    [114, 542], [114, 474], [76, 474], [76, 394], [38, 394], [38, 314], [14, 314]];
  poly(VOID, '#0a0c10');
  for (const [a, b, y] of [[14, 346, 312], [38, 322, 392], [76, 284, 472], [114, 246, 540]]) rect(a, y, b - a, 3, '#8a6a42');
  line(VOID.concat([VOID[0]]), '#5a4330', 1);
  poly([[300, 314], [346, 314], [346, 292], [326, 296]], '#6b4f2a'); txt('DISPOSAL', 344, 288, 5.5, '#d6b98c', 'right');
  rect(150, 534, 60, 6, '#0e7490'); rect(156, 535, 20, 1, '#67e8f9');
  // label zona
  const L = (s, x, y, a = 'left') => txt(s, x, y, 6.5, '#b8b2a7', a, 700);
  // label zona sengaja jauh dari baris nama karyawan (tepat di bawah kaki)
  L('POS STOP · MENUNGGU ANDA', 62, 122); L('RADIO · WEB', 354, 122, 'right');
  L('KANTOR · RENCANA', 6, 207); L('WORKSHOP', 140, 207); L('LAPANGAN APEL', 238, 207);
  txt('TAMAN', 214, 259, 5.5, '#bef264', 'center', 900);
  L('HAULING ROAD · EDIT FILE', 18, 301); L('BENCH 1 · SURVEI / BACA', 318, 325, 'right'); L('FRONT PIT · BEKO / BASH', 280, 410, 'right'); L('PIT FLOOR', 242, 490, 'right');
  txt('SEAM BATUBARA', 180, 561, 6, '#71717a', 'center');
  txt("PT MAUL'S CORP · SITE CLAUDE", 180, 588, 6.5, '#57534e', 'center');
  ctx = prev;
}
function getBg() {
  const key = `${new Date().getHours()}|${cv.width}`;
  if (key !== bgKey) {
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d'); g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); drawBg(g); bgKey = key;
  }
  return bg;
}

// ---------- karakter & alat berat
function worker(x, y, helmet, o = {}) {
  const t = o.t || 0, f = o.face || 1, sw = o.walk ? Math.sin(t * 12 + x * 0.3) * 2 : 0;
  ctx.save(); ctx.translate(x, y); if (o.lie) ctx.rotate(Math.PI / 2); ctx.scale(f, 1);
  rect(-3 + sw * 0.5, -7, 2.6, 7, '#1e293b'); rect(0.5 - sw * 0.5, -7, 2.6, 7, '#1e293b');
  rect(-4, -14, 8, 8, '#f97316'); rect(-4, -11, 8, 1.4, '#e5e7eb');
  const arm = (x2, y2) => line([[3.5, -13], [x2, y2]], '#f97316', 2);
  line([[-3.5, -13], [-5 - sw * 0.4, -8]], '#f97316', 2);
  switch (o.pose) {
    case 'up': { const b = Math.sin(t * 3) * 2.5; line([[-3.5, -13], [-5, -20 + b]], '#f97316', 2); arm(5, -20 + b); rect(-9, -21 + b, 18, 1.5, '#d4d4d4'); rect(-10, -23.5 + b, 2.5, 6, '#3f3f46'); rect(7.5, -23.5 + b, 2.5, 6, '#3f3f46'); break; }
    case 'point': arm(9, -17); break;
    case 'cup': arm(7, -11); rect(6, -14, 3, 3.5, '#f5f5f5'); for (let i = 0; i < 2; i++) line([[7 + i * 1.5, -15], [7.5 + i * 1.5 + Math.sin(t * 4 + i) * 0.8, -19]], 'rgba(229,229,229,.5)', 0.7); break;
    case 'wave': arm(7, -19 + Math.sin(t * 8) * 2); break;
    case 'clip': arm(7, -10); rect(5, -14, 5, 6, '#fde68a'); break;
    case 'radio': arm(6, -17); rect(5, -21, 2, 5, '#111'); line([[6, -21], [6, -25]], '#999', 0.6); break;
    default: arm(5 + sw * 0.4, -8);
  }
  circle(0, -16.5, 3, '#d6a77a');
  ctx.fillStyle = helmet; ctx.beginPath(); ctx.arc(0, -17.4, 3.7, Math.PI, 0); ctx.fill(); rect(-4.8, -17.6, 9.6, 1.4, helmet);
  ctx.restore();
}
function excavator(x, y, helmet, t, ph) {
  const k = Math.sin(t * 2 + ph);
  ctx.save(); ctx.translate(x, y);
  rect(-15, -6, 30, 6, '#292524'); for (let i = -11; i <= 11; i += 5.5) circle(i, -3, 1.8, '#57534e');
  rect(-12, -15, 26, 9, '#facc15'); rect(9, -14, 6, 8, '#ca8a04'); txt('MC', 2, -8.5, 5, '#000', 'center', 900);
  rect(-10, -26, 11, 11, '#eab308'); rect(-9, -25, 8, 6, '#0c4a6e');
  circle(-5, -20.8, 2.1, '#d6a77a'); ctx.fillStyle = helmet; ctx.beginPath(); ctx.arc(-5, -21.6, 2.6, Math.PI, 0); ctx.fill();
  const a1 = -2.5 + k * 0.22, a2 = 2.0 + k * 0.35;
  const ex = -12 + Math.cos(a1) * 16, ey = -14 + Math.sin(a1) * 16, bx = ex + Math.cos(a2) * 15, by = ey + Math.sin(a2) * 15;
  line([[-12, -14], [ex, ey], [bx, by]], '#facc15', 3); circle(ex, ey, 1.5, '#a16207');
  poly([[bx - 3.5, by - 1], [bx + 2.5, by - 1], [bx - 1, by + 4]], '#a16207');
  if (k < -0.4) for (let j = 0; j < 3; j++) circle(bx - 2 - j * 3, by + 1 - j * 2.5 - ((t * 18) % 5), 1.8 + j * 0.8, 'rgba(190,160,120,.45)');
  ctx.restore();
}
function truck(x, y, dir, helmet, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  rect(-18, -6, 34, 3, '#3f3f46');
  rect(-18, -17, 23, 11, '#f59e0b'); rect(-18, -17, 23, 2, '#b45309');
  if (dir > 0) poly([[-17, -17], [4, -17], [0, -21], [-12, -22]], '#7c5a3a'); // muatan menuju disposal
  rect(6, -18, 10, 12, '#facc15'); rect(9, -16, 6, 5, '#0c4a6e');
  circle(12, -13.2, 1.8, '#d6a77a'); ctx.fillStyle = helmet; ctx.beginPath(); ctx.arc(12, -14, 2.3, Math.PI, 0); ctx.fill();
  txt('MC', 11, -7.4, 3.6, '#000', 'center', 900);
  for (const wx of [-12, -5, 10]) { circle(wx, -2, 3.3, '#18181b'); circle(wx, -2, 1.2, '#71717a'); }
  if (Math.sin(t * 10) > 0) circle(-18 - 3, -5, 1.5, 'rgba(160,140,110,.4)');
  ctx.restore();
}

function drawAgent(a, p, tg, t, now) {
  const col = helmetOf(a), ph = (hash(a.id) % 100) / 16, pose = tg.z === 'apel' ? 'apel' : a.state;
  let top = p.y - 22, x = p.x, y = p.y;
  if (p.moving || pose === 'leaving') worker(x, y, col, { walk: true, t, face: p.face });
  else switch (pose) {
    case 'bash': excavator(x, y, col, t, ph); top = y - 30; break;
    case 'edit': truck(x, y, tg.dir || 1, col, t); top = y - 24; break;
    case 'read':
      worker(x, y, col, { t, face: 1 });
      line([[x + 9, y - 10], [x + 5, y]], '#d4d4d4', 0.8); line([[x + 9, y - 10], [x + 13, y]], '#d4d4d4', 0.8); rect(x + 6, y - 14, 6, 4, '#facc15');
      ctx.setLineDash([2, 2]); line([[x + 12, y - 12], [x + 34, y - 12 + Math.sin(t * 2 + ph) * 7]], 'rgba(34,211,238,.8)', 0.8); ctx.setLineDash([]);
      break;
    case 'web': worker(x, y, col, { t, pose: 'radio' }); break;
    case 'think':
      worker(x, y, col, { t, pose: 'point' });
      for (let i = 0; i < 3; i++) circle(x + 6 + i * 3.5, y - 27, (Math.floor(t * 3) % 3) === i ? 1.4 : 0.9, '#e5e5e5');
      top = y - 30; break;
    case 'delegate': worker(x, y, col, { t, pose: 'wave' }); break;
    case 'p2h': {
      worker(x, y, col, { t, pose: 'clip' });
      const n = Math.floor(t * 2.5) % 4; for (let i = 0; i < n; i++) txt('✓', x + 9 + i * 4, y - 15, 5, '#22c55e');
      break;
    }
    case 'error':
      worker(x, y, col, { t });
      for (let j = 0; j < 3; j++) { const k = (t * 14 + j * 7) % 21; circle(x + 7 + Math.sin(k) * 2, y - 12 - k, 2 + k / 8, `rgba(120,120,120,${0.6 - k / 40})`); }
      if (Math.sin(t * 8) > 0) circle(x + 8, y - 9, 1.6, '#ef4444');
      break;
    case 'compact':
      worker(x, y, col, { t }); rect(x + 6, y - 9, 5, 7, '#a16207'); rect(x + 10, y - 8, 3, 1.2, '#a16207');
      circle(x + 13, y - 6 + ((t * 10) % 6), 0.9, '#d4a373');
      break;
    case 'kantin': worker(x, y, col, { t, pose: 'cup' }); break;
    case 'rain': worker(x, y, col, { t }); break;
    case 'gym': worker(x, y, col, { t: t + ph, pose: 'up' }); top = y - 28; break;
    case 'taman': worker(x, y, col, { t, walk: true, face: Math.cos(t * 0.7 + ph) > 0 ? 1 : -1 }); break;
    case 'mess':
      worker(x, y, col, { t, lie: true });
      txt('z', x + 18 + Math.sin(t * 2 + ph) * 1.5, y - 7 - ((t * 4 + ph) % 6), 6, '#93c5fd', 'left', 700);
      top = y - 14; break;
    case 'apel': worker(x, y, col, { t, face: 1 }); break;
    default: worker(x, y, col, { t, face: p.face });
  }
  // label nama
  const nm = nameOf(a).slice(0, 11);
  ctx.font = `700 7px ${MONO}`;
  const w = ctx.measureText(nm).width + 4, ly = (pose === 'mess' ? y + 6 : y + 3), lx = Math.min(Math.max(x, w / 2), W - w / 2);
  const must = a.state === 'waiting' || a.id === sel; // label yang bertabrakan dilewati, kecuali yang penting
  if (must || !labels.some(r => Math.abs(r.x - lx) < (r.w + w) / 2 && Math.abs(r.y - ly) < 9)) {
    labels.push({ x: lx, y: ly, w });
    rect(lx - w / 2, ly, w, 9, 'rgba(0,0,0,.82)'); txt(nm, lx, ly + 7, 7, a.id === sel ? '#facc15' : '#f4f4f0', 'center');
  }
  // penanda status (ikon + warna, bukan warna saja — NFR-08)
  const m = meta(a);
  if (a.state === 'waiting') {
    const on = Math.sin(t * 7) > -0.3;
    ctx.strokeStyle = 'rgba(250,204,21,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y - 9, 13 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.stroke();
    rect(x - 8, top - 19, 16, 16, on ? '#facc15' : '#000'); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 8, top - 19, 16, 16);
    txt('!', x, top - 6.5, 13, on ? '#000' : '#facc15', 'center', 900, 'Arial Black, Arial, sans-serif');
  } else if (pose !== 'apel') {
    rect(x - 6.5, top - 14, 13, 13, 'rgba(0,0,0,.85)'); ctx.strokeStyle = m.color; ctx.lineWidth = 1; ctx.strokeRect(x - 6.5, top - 14, 13, 13);
    txt(m.icon, x, top - 4.3, 8, '#fff', 'center', 400, EMOJI);
  }
  if (a.id === sel) {
    const k = 2 + Math.sin(t * 6) * 1.5;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 14 - k, top - 20 - k, 28 + k * 2, y - top + 34 + k * 2);
    poly([[x - 4, top - 28 - k], [x + 4, top - 28 - k], [x, top - 23 - k]], '#fff');
  }
}

function scenery(t, list, now) {
  const waiting = list.some(a => a.state === 'waiting');
  // lampu rotator pos STOP
  if (waiting) {
    ctx.save(); ctx.translate(75, 70); ctx.rotate(t * 5);
    poly([[0, 0], [40, -9], [40, 9]], 'rgba(250,204,21,.28)'); poly([[0, 0], [-40, -9], [-40, 9]], 'rgba(250,204,21,.28)');
    ctx.restore();
    if (Math.sin(t * 6) > 0) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(58, 56, 206, 64); }
  }
  circle(75, 70, 2.6, waiting ? (Math.sin(t * 10) > 0 ? '#fde047' : '#ca8a04') : '#57534e');
  // palang: tertutup saat ada yang menunggu
  ctx.save(); ctx.translate(88, 88); ctx.rotate(waiting ? 0 : -1.15);
  for (let i = 0; i < 8; i++) rect(i * 8, -1.5, 8, 3, i % 2 ? '#f5f5f5' : '#dc2626');
  ctx.restore();
  // menara radio berkedip
  const web = list.some(a => a.state === 'web' && !pos.get(a.id)?.moving);
  circle(326, 10, 1.8, Math.sin(t * 4) > 0 ? '#ef4444' : '#450a0a');
  if (web) for (let i = 0; i < 3; i++) { const r = ((t * 14 + i * 6) % 18); ctx.strokeStyle = `rgba(96,165,250,${1 - r / 18})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(326, 12, r, -2.6, -0.5); ctx.stroke(); }
  // bus karyawan: datang (agent baru) / pulang
  if (list.some(a => a.state === 'leaving' || now - a.born < 3500)) {
    rect(0, 84, 46, 14, '#f5f5f5'); rect(0, 84, 46, 3, '#facc15'); for (let x = 4; x < 40; x += 8) rect(x, 88, 6, 4, '#0c4a6e');
    circle(9, 98, 2.5, '#111'); circle(36, 98, 2.5, '#111'); txt('BUS MC', 23, 96, 4.2, '#111', 'center', 900);
  }
}
function rainOverlay(t) {
  rect(0, 0, W, H, 'rgba(8,20,40,.33)');
  ctx.strokeStyle = 'rgba(147,197,253,.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
  for (let i = 0; i < 110; i++) { const x = (i * 37 + t * 40) % (W + 20) - 10, y = (i * 53 + t * 380) % H; ctx.moveTo(x, y); ctx.lineTo(x - 2.5, y + 8); }
  ctx.stroke();
  rect(126, 330, 108, 22, '#dc2626'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(127, 331, 106, 20);
  txt('⛈ RAIN STOP', 180, 345, 10, '#fff', 'center', 900);
  txt('rate limit / API error · alat berhenti', 180, 362, 6, '#fecaca', 'center');
}

// ---------- layout & gerak
function zoneOf(a, now) { return now < snap.apelUntil && a.state !== 'waiting' && a.state !== 'leaving' ? 'apel' : (ZONE_OF[a.state] || 'kantor'); }
function slot(z, i, t) {
  switch (z) {
    case 'stop': return { x: 118 + (i % 8) * 19, y: 100 };
    case 'radio': return { x: 270 + (i % 3) * 14, y: 100 };
    case 'kantor': return { x: 30 + (i % 6) * 16, y: 185 };
    case 'workshop': return { x: 152 + (i % 5) * 14, y: 185 };
    case 'apel': return { x: 248 + (i % 5) * 15, y: 185 };
    case 'kantin': return { x: 16 + (i % 5) * 14, y: 270 };
    case 'gym': return { x: 110 + (i % 3) * 18, y: 270 };
    case 'taman': return { x: 196 + (i % 3) * 18 + Math.sin(t * 0.7 + i * 2) * 9, y: 270 };
    case 'mess': return { x: 272 + (i % 4) * 19, y: 256 - Math.floor(i / 4 % 2) * 12 };
    case 'messdoor': return { x: 264 + (i % 3) * 14, y: 270 };
    case 'road': { const k = t * 0.45 + i * 2.1; return { x: 42 + (0.5 - 0.5 * Math.cos(k)) * 250, y: 312, dir: Math.sin(k) >= 0 ? 1 : -1 }; }
    case 'bench1': return { x: 56 + (i % 6) * 44, y: 392 };
    case 'bench2': return i < 4 ? { x: 106 + i * 50, y: 472 } : { x: 140 + ((i - 4) % 3) * 44, y: 540 };
    case 'gate': return { x: -30, y: 100 };
    default: return { x: 60, y: 185 };
  }
}
function layout(list, now, t) {
  const groups = {}, out = new Map();
  for (const a of list) (groups[zoneOf(a, now)] ||= []).push(a);
  for (const [z, arr] of Object.entries(groups)) {
    arr.sort((p, q) => p.born - q.born || (p.id < q.id ? -1 : 1));
    arr.forEach((a, i) => out.set(a.id, { z, ...slot(z, i, t) }));
  }
  return out;
}
function step(list, targets, dt) {
  for (const a of list) {
    const tg = targets.get(a.id);
    let p = pos.get(a.id);
    if (!p) { p = a.parent ? { x: 262, y: 270, face: 1 } : { x: -12, y: 100, face: 1 }; pos.set(a.id, p); } // kru keluar mess, agent masuk gerbang
    const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy), v = 150 * dt;
    if (d <= v) { p.x = tg.x; p.y = tg.y; p.moving = false; }
    else { p.x += dx / d * v; p.y += dy / d * v; p.moving = true; if (Math.abs(dx) > 0.3) p.face = Math.sign(dx); }
  }
  for (const id of pos.keys()) if (!list.some(a => a.id === id)) pos.delete(id);
}

// ---------- frame loop (maks 30 FPS; rAF berhenti sendiri saat tab tersembunyi)
let scale = 1, dpr = 1, last = 0, frames = 0, fpsT = 0, labels = [];
function frame(ts) {
  requestAnimationFrame(frame);
  if (ts - last < 32) return;
  const dt = Math.min((ts - last) / 1000, 0.1); last = ts;
  frames++; if (ts - fpsT > 1000) { $('#fps').textContent = `${frames} FPS`; frames = 0; fpsT = ts; }
  const t = ts / 1000, now = srvNow(), list = visible(), targets = layout(list, now, t);
  step(list, targets, dt); labels = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(getBg(), 0, 0);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  scenery(t, list, now);
  // garis putus-putus subagent -> induk
  ctx.setLineDash([3, 3]);
  for (const a of list) { const p = pos.get(a.id), q = a.parent && pos.get(a.parent); if (p && q) line([[p.x, p.y - 10], [q.x, q.y - 10]], 'rgba(255,255,255,.45)', 1); }
  ctx.setLineDash([]);
  const order = (p, q) => pos.get(p.id).y - pos.get(q.id).y;
  for (const a of list.filter(a => a.state !== 'waiting').sort(order)) drawAgent(a, pos.get(a.id), targets.get(a.id), t, now);
  if (list.some(a => a.state === 'rain')) rainOverlay(t);
  for (const a of list.filter(a => a.state === 'waiting')) drawAgent(a, pos.get(a.id), targets.get(a.id), t, now); // FR-04: di atas hujan
  if (now < snap.apelUntil && list.length) {
    worker(334, 177, '#ffffff', { t, face: -1, pose: 'point' });
    rect(236, 140, 104, 15, '#facc15'); txt('SAFETY TALK PAGI · K3', 288, 150.5, 7, '#000', 'center', 900);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i], k = (performance.now() - f.t0) / 1300, p = pos.get(f.id);
    if (k >= 1 || !p) { floats.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - k; txt(f.text, p.x + 10, p.y - 30 - k * 18, 7, '#facc15', 'left', 900); ctx.globalAlpha = 1;
  }
  if (!list.length) {
    rect(40, 196, 280, 46, 'rgba(0,0,0,.85)'); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1; ctx.strokeRect(40, 196, 280, 46);
    txt('Site sepi — belum ada karyawan', 180, 214, 9, '#facc15', 'center', 900);
    txt('Jalankan Claude Code, atau tekan ▶ Demo', 180, 231, 7.5, '#d4d4d4', 'center');
  }
}

function resize() {
  const hdr = $('#hdr').offsetHeight, alertH = $('#alert').classList.contains('show') ? $('#alert').offsetHeight : 0;
  document.documentElement.style.setProperty('--hdr', hdr + 'px');
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (innerWidth >= 900) {
    const r = $('#stage').getBoundingClientRect();
    scale = Math.max(0.5, Math.min((r.width - 20) / W, (innerHeight - hdr - alertH - 20) / H));
  } else scale = Math.min(document.documentElement.clientWidth / W, 2);
  cv.style.width = `${W * scale}px`; cv.style.height = `${H * scale}px`;
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
}
addEventListener('resize', resize);

// ---------- interaksi kanvas
function hit(ev) {
  const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H;
  let best = null, bd = 18;
  for (const a of visible()) { const p = pos.get(a.id); if (!p) continue; const d = Math.hypot(p.x - x, p.y - 12 - y); if (d < bd) { bd = d; best = a; } }
  return best;
}
cv.addEventListener('click', ev => { const a = hit(ev); select(a ? a.id : null, !!a); });
cv.addEventListener('pointermove', ev => {
  const tip = $('#tip');
  if (ev.pointerType !== 'mouse') return;
  const a = hit(ev);
  if (!a) { tip.style.display = 'none'; return; }
  const r = $('#stage').getBoundingClientRect(), m = meta(a);
  tip.innerHTML = `<b>${esc(nameOf(a))}</b><br>${m.icon === '!' ? '⚠' : m.icon} ${esc(m.label)}<br>${dur(srvNow() - a.since)}${a.tool && !content ? ' · ' + esc(a.tool) : ''}`;
  tip.style.display = 'block';
  tip.style.left = `${Math.min(ev.clientX - r.left + 12, r.width - 230)}px`; tip.style.top = `${ev.clientY - r.top + 12}px`;
});
cv.addEventListener('pointerleave', () => { $('#tip').style.display = 'none'; });

function select(id, openSheet) {
  sel = id; renderPanel(true);
  if (id && openSheet && innerWidth < 900) { $('#sheet').classList.add('open'); $('#grab').setAttribute('aria-expanded', 'true'); }
  if (id) document.querySelector(`#list li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ---------- panel HTML
function ordered(list) {
  const rank = a => ({ wait: 0, work: 1, idle: 2 }[meta(a).kind]);
  const mains = list.filter(a => !a.parent || !list.some(p => p.id === a.parent)).sort((p, q) => rank(p) - rank(q) || p.born - q.born);
  return mains.flatMap(m => [m, ...list.filter(c => c.parent === m.id).sort((p, q) => p.born - q.born)]);
}
function renderPanel(force) {
  const list = visible(), now = srvNow();
  const wait = list.filter(a => a.state === 'waiting'), work = list.filter(a => meta(a).kind === 'work'), idle = list.filter(a => meta(a).kind === 'idle');
  $('#cWait b').textContent = wait.length; $('#cWait').classList.toggle('hot', wait.length > 0);
  $('#cWork b').textContent = work.length; $('#cIdle b').textContent = idle.length;
  $('#sum').textContent = `⚠ ${wait.length} menunggu · ⛏ ${work.length} kerja · ☕ ${idle.length} idle`;
  $('#nAgents').textContent = list.length;
  document.title = wait.length ? `(${wait.length}) ⚠ Tambang Agent` : 'Tambang Agent';
  const al = $('#alert'), had = al.classList.contains('show');
  al.classList.toggle('show', wait.length > 0);
  al.innerHTML = wait.length ? `<span>⚠ POS STOP: ${wait.map(a => `${esc(nameOf(a))} butuh izin (${dur(now - a.since)})`).join(' · ')}</span>` : '';
  if (had !== wait.length > 0) resize();
  $('#btnContent').setAttribute('aria-pressed', content); $('#bContent').classList.toggle('on', content);
  $('#btnSound').setAttribute('aria-pressed', sound);
  $('#btnDemo').setAttribute('aria-pressed', !!snap.sim); $('#btnDemo').textContent = snap.sim ? '■ Stop demo' : '▶ Demo'; $('#bDemo').classList.toggle('on', !!snap.sim);
  $('#day').textContent = new Date(now).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  const ul = $('#list');
  ul.innerHTML = list.length ? ordered(list).map(a => {
    const m = meta(a), tool = a.tool && !content && m.kind !== 'idle' ? ` · ${esc(a.tool)}` : '';
    return `<li data-id="${esc(a.id)}" class="${a.id === sel ? 'sel' : ''} ${a.parent ? 'sub' : ''}"><button data-id="${esc(a.id)}">
      <span class="ico" style="border-color:${m.color};color:${m.color}">${m.icon === '!' ? '<b>!</b>' : m.icon}</span>
      <span class="nm">${a.parent ? '└ ' : ''}${esc(nameOf(a))}</span><span class="dur">${dur(now - a.since)}</span>
      <span class="st"><b style="color:${m.color}">${esc(m.label)}</b>${tool}</span></button></li>`;
  }).join('') : `<li class="empty">Belum ada karyawan. Jalankan sesi Claude Code (hook harus terpasang), atau putar demo.<br><button data-demo>▶ Putar demo</button></li>`;

  const a = list.find(x => x.id === sel), d = $('#detail');
  if (!a) { d.classList.remove('show'); if (sel && !snap.agents.some(x => x.id === sel)) sel = null; }
  else if (force || !d.contains(document.activeElement)) {
    const m = meta(a), kids = list.filter(c => c.parent === a.id), par = list.find(p => p.id === a.parent);
    d.classList.add('show');
    d.innerHTML = `<div class="dhead"><span class="ico" style="border-color:${m.color};color:${m.color}">${m.icon === '!' ? '<b>!</b>' : m.icon}</span>
      <div><h3>${esc(nameOf(a))}</h3><p><b style="color:${m.color}">${esc(m.label)}</b> · ${esc(m.zone)}</p></div></div>
      <div class="kv"><div><small>DURASI</small><b>${dur(now - a.since)}</b></div><div><small>RITASE</small><b>${a.ritase}</b></div><div><small>TONASE</small><b>${content ? '•••' : fmtK(a.tonase)}</b></div></div>
      <p class="dhead" style="display:block;font:12px var(--mono);color:var(--dim);margin:0 0 8px">
        ${!content && a.tool ? `Tool terakhir: <b style="color:var(--fg)">${esc(a.tool)}</b><br>` : ''}
        ${par ? `Induk: <b style="color:var(--fg)">${esc(nameOf(par))}</b><br>` : ''}${kids.length ? `Kru subagent: ${kids.length}<br>` : ''}
        Masuk site: ${new Date(a.born).toLocaleTimeString('id-ID')} · sumber: ${esc(content ? '—' : a.source)}</p>
      ${content ? '' : `<form class="rename"><input name="n" maxlength="32" value="${esc(a.name)}" aria-label="Nama karyawan"><button>Ubah nama</button></form>`}
      <ul class="tl">${a.log.slice().reverse().map(l => `<li><time>${new Date(l.t).toLocaleTimeString('id-ID', { hour12: false })}</time><span>${esc(EVL[l.e] || l.e)}${l.tool && !content ? ' · ' + esc(l.tool) : ''}</span></li>`).join('')}</ul>`;
  }

  const rows = ordered(list).sort((p, q) => q.ritase - p.ritase);
  $('#prod tbody').innerHTML = rows.map(a => `<tr><td>${a.parent ? '└ ' : ''}${esc(nameOf(a))}</td><td>${a.ritase}</td><td>${content ? '•••' : fmtK(a.tonase)}</td></tr>`).join('')
    || '<tr><td colspan="3" style="text-align:left;color:var(--dim)">Belum ada produksi hari ini</td></tr>';
  $('#prod tfoot').innerHTML = rows.length ? `<tr><td>TOTAL</td><td>${rows.reduce((s, a) => s + a.ritase, 0)}</td><td>${content ? '•••' : fmtK(rows.reduce((s, a) => s + a.tonase, 0))}</td></tr>` : '';
}
$('#list').addEventListener('click', ev => {
  if (ev.target.closest('[data-demo]')) return demo(true);
  const b = ev.target.closest('button[data-id]'); if (b) select(b.dataset.id === sel ? null : b.dataset.id);
});
$('#detail').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = ev.target.n.value.trim();
  if (name && sel) post('rename', { id: sel, name }).then(() => ev.target.n.blur());
});
$('#alert').addEventListener('click', () => { const w = visible().find(a => a.state === 'waiting'); if (w) select(w.id, true); });
$('#grab').addEventListener('click', () => { const o = $('#sheet').classList.toggle('open'); $('#grab').setAttribute('aria-expanded', o); });

// ---------- tombol
const post = (p, body) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tambang': '1' }, body: JSON.stringify(body) });
function demo(on) { post('sim', { on }); }
$('#btnDemo').addEventListener('click', () => demo(!snap.sim));
$('#btnContent').addEventListener('click', () => { content = !content; store.set('content', content); pseudo.clear(); renderPanel(true); });
let actx = null;
function horn() {
  try {
    const t0 = actx.currentTime;
    [[523, 0], [392, 0.22]].forEach(([f, d]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.05; o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 0.18); });
  } catch { /* audio tidak tersedia */ }
}
$('#btnSound').addEventListener('click', () => {
  sound = !sound; store.set('sound', sound);
  if (sound) { try { actx ||= new AudioContext(); actx.resume(); horn(); } catch { /* tanpa audio */ } }
  renderPanel();
});
const legend = $('#legend');
$('#legBody').innerHTML = Object.values(S).map(m => `<tr><td style="color:${m.color}">${m.icon === '!' ? '<b>!</b>' : m.icon}</td><td><b style="color:${m.color}">${m.label}</b></td><td>${m.zone}</td></tr>`).join('');
$('#btnLegend').addEventListener('click', () => legend.showModal());
$('#legClose').addEventListener('click', () => legend.close());

// ---------- data live (SSE)
function onSnap(s) {
  snap = s; skew = s.now - Date.now();
  const list = visible(), waitIds = new Set(list.filter(a => a.state === 'waiting').map(a => a.id));
  if ([...waitIds].some(id => !prevWaiting.has(id))) { if (sound && actx) horn(); navigator.vibrate?.([180, 80, 180]); }
  prevWaiting = waitIds;
  for (const a of list) {
    const before = prevRit.get(a.id);
    if (before !== undefined && a.ritase > before) floats.push({ id: a.id, t0: performance.now(), text: `+${a.ritase - before} rit` });
    prevRit.set(a.id, a.ritase);
  }
  renderPanel();
}
function connect() {
  const es = new EventSource('stream');
  es.onmessage = e => { lastMsg = Date.now(); onSnap(JSON.parse(e.data)); };
  es.addEventListener('ping', () => { lastMsg = Date.now(); });
  setInterval(() => {
    const ok = es.readyState === 1 && Date.now() - lastMsg < 45000;
    offSince = ok ? 0 : offSince || Date.now();
    const off = offSince && Date.now() - offSince > 3000;
    $('#conn').className = ok ? 'live' : off ? 'off' : '';
    $('#conn').textContent = ok ? '● LIVE' : off ? '● TERPUTUS' : '● …';
    $('#offline').classList.toggle('show', !!off);
    renderPanel(); // durasi berjalan
  }, 1000);
}

if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
resize(); renderPanel(); connect(); requestAnimationFrame(frame);
