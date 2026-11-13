import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld, cube, AZ, SIZE } from './world.js';

// ---------- config & state meta ----------
const q = new URLSearchParams(location.search);
const IDLE_GYM = (Number(q.get('idle1')) || 5) * 60000;   // idle > 5 min -> gym/taman
const IDLE_MESS = (Number(q.get('idle2')) || 30) * 60000; // idle > 30 min -> mess
const ERROR_SHOW = 6000;                                  // workshop visit after a tool error

// group = colour + meaning (icon + colour, never colour alone: NFR-08)
const VIEW = {
  waiting:  ['⚠', 'MENUNGGU ANDA', 'wait', 'stop'],
  rain:     ['🌧', 'Rain stop (API error)', 'bad', 'shelter'],
  error:    ['🔧', 'Error tool', 'bad', 'workshop'],
  bash:     ['⛏', 'Menjalankan perintah', 'work', 'pit'],
  edit:     ['🚚', 'Menulis file', 'work', 'truck'],
  read:     ['🔍', 'Membaca kode', 'work', 'survey'],
  web:      ['📡', 'Riset web', 'work', 'radio'],
  think:    ['📋', 'Merencanakan', 'work', 'office'],
  delegate: ['👷', 'Delegasi ke kru', 'work', 'delegate'],
  compact:  ['🛢', 'Ganti oli (kompaksi)', 'work', 'workshop'],
  canteen:  ['☕', 'Ngopi', 'idle', 'canteen'],
  gym:      ['🏋', 'Gym', 'idle', 'gym'],
  park:     ['🌳', 'Jalan di taman', 'idle', 'park'],
  mess:     ['💤', 'Tidur di mess', 'idle', 'mess'],
  leaving:  ['🚌', 'Pulang', 'idle', 'bus'],
};
const RANK = Object.keys(VIEW);
const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0;

function viewOf(a, now) {
  if (a.state === 'idle') {
    const idle = now - a.since;
    if (idle < IDLE_GYM) return 'canteen';
    if (idle < IDLE_MESS) return hash(a.id) % 2 ? 'gym' : 'park'; // fixed per agent, not random per frame
    return 'mess';
  }
  if (a.state === 'error' && now - a.since > ERROR_SHOW) return 'think';
  return VIEW[a.state] ? a.state : 'think';
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tambang.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tambang.' + k, JSON.stringify(v)); } catch {} },
};
const S = { theme: store.get('theme', 'auto'), content: store.get('content', false), sound: store.get('sound', true), names: store.get('names', {}) };

// ---------- renderer & camera ----------
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
stage.prepend(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
stage.append(labels.domElement);

const scene = new THREE.Scene();
const world = buildWorld(scene);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
const EL = THREE.MathUtils.degToRad(34);
const camDir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
const basePos = camDir.clone().multiplyScalar(80);
const baseInv = new THREE.Matrix4(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
let frameCenter = new THREE.Vector2();

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h);
  camera.position.copy(basePos); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  baseInv.copy(camera.matrixWorldInverse);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0); camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  // fit the whole diorama (incl. tower top) into the stage
  const lo = new THREE.Vector2(Infinity, Infinity), hi = new THREE.Vector2(-Infinity, -Infinity), p = new THREE.Vector3();
  for (const x of [-1, 1]) for (const y of [-5.2, SIZE.top]) for (const z of [-1, 1]) {
    p.set(x * (SIZE.w / 2 + 0.3), y, z * (SIZE.d / 2 + 0.3)).applyMatrix4(baseInv); lo.min(p); hi.max(p);
  }
  frameCenter = lo.clone().add(hi).multiplyScalar(0.5);
  let hw = (hi.x - lo.x) / 2 * 1.02, hh = (hi.y - lo.y) / 2 * 1.02;
  if (hw / hh > w / h) hh = hw * h / w; else hw = hh * w / h;
  Object.assign(camera, { left: frameCenter.x - hw, right: frameCenter.x + hw, top: frameCenter.y + hh, bottom: frameCenter.y - hh });
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- characters ----------
const chars = new Map();
let focusId = null;
const SPAWN = new THREE.Vector3(-30, 0, 28), CREW_DOOR = new THREE.Vector3(24, 0, 16.3); // gate, mess door

function limb(parent, x, y, w, len, color) {
  const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g);
  cube(g, w, len, w, color, 0, -len / 2, 0);
  return g;
}

function makeChar(a) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); scene.add(root);
  const legL = limb(body, -0.15, 0.55, 0.22, 0.55, '#2d3a4a'), legR = limb(body, 0.15, 0.55, 0.22, 0.55, '#2d3a4a');
  cube(body, 0.6, 0.6, 0.36, '#ff7a00', 0, 0.85, 0);
  cube(body, 0.62, 0.08, 0.38, '#e8e8e8', 0, 0.78, 0); // reflective stripe
  const armL = limb(body, -0.4, 1.12, 0.18, 0.55, '#ff7a00'), armR = limb(body, 0.4, 1.12, 0.18, 0.55, '#ff7a00');
  cube(body, 0.4, 0.4, 0.4, '#e0b08a', 0, 1.36, 0);
  const helm = a.parent ? '#2f7cf6' : '#f4f4f4'; // subagent crew wear blue helmets
  cube(body, 0.48, 0.2, 0.48, helm, 0, 1.64, 0);
  cube(body, 0.54, 0.05, 0.62, helm, 0, 1.56, 0.05);
  const hit = cube(root, 1.4, 2.4, 1.4, '#000000', 0, 1.1, 0); hit.visible = false; hit.userData.id = a.id;
  const el = document.createElement('div');
  const label = new CSS2DObject(el); label.center.set(0.5, 1); root.add(label);
  return { root, hit, body, legL, legR, armL, armR, label, el, seed: hash(a.id) % 100, target: new THREE.Vector3(), html: '', line: null };
}

function displayName(a) {
  if (S.content) {
    if (!pseudo.has(a.id)) {
      const n = [...pseudo.values()].filter((v) => v.startsWith(a.parent ? 'Kru' : 'Op')).length + 1;
      pseudo.set(a.id, a.parent ? `Kru ${n}` : `Operator ${String(n).padStart(2, '0')}`);
    }
    return pseudo.get(a.id);
  }
  return (a.parent ? '↳ ' : '') + (S.names[a.name] || a.name);
}
const pseudo = new Map();
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function pose(c, t, moving) {
  let aL = 0, aR = 0, lL = 0, lR = 0, by = 0, lie = false;
  const walk = (speed, amp) => { const s = Math.sin(t * speed + c.seed) * amp; lL = s; lR = -s; aL = -s * 0.8; aR = s * 0.8; };
  if (moving) walk(12, 0.7);
  else switch (c.view) {
    case 'waiting': aL = aR = -2.7 + Math.sin(t * 9) * 0.35; by = Math.abs(Math.sin(t * 9)) * 0.15; break;
    case 'bash': case 'error': case 'compact': aR = -1.2 + Math.sin(t * 10 + c.seed) * 0.5; aL = -0.8; break;
    case 'think':
      if (c.sit) { // seated at a desk, typing
        lL = lR = -Math.PI / 2; by = -0.03;
        aL = -1.25 + Math.sin(t * 14 + c.seed) * 0.08; aR = -1.25 + Math.sin(t * 14 + c.seed + 1.5) * 0.08;
      } else aR = -1.6 + Math.sin(t * 2) * 0.1;
      break;
    case 'read': aL = aR = -1.1; break;
    case 'web': aR = -2.3 + Math.sin(t * 3) * 0.2; break;
    case 'delegate': aR = -2.6 + Math.sin(t * 7) * 0.4; break;
    case 'gym': aL = aR = -1.6 - Math.abs(Math.sin(t * 2.5 + c.seed)) * 1.4; break;
    case 'canteen': aR = -1.3 + Math.sin(t * 1.2 + c.seed) * 0.25; break;
    case 'park': walk(5, 0.4); break;
    case 'rain': aL = aR = -0.6; by = Math.sin(t * 40) * 0.015; break;
    case 'mess': lie = true; break;
  }
  c.legL.rotation.x = lL; c.legR.rotation.x = lR; c.armL.rotation.x = aL; c.armR.rotation.x = aR;
  c.body.rotation.x = lie ? -Math.PI / 2 : 0;
  c.body.position.y = by + (lie ? 0.2 : 0);
}

// ---------- live data (SSE from the relay) ----------
let ready = false;
const es = new EventSource('/stream');
es.onopen = () => setConn(true);
es.onerror = () => setConn(false);
es.onmessage = (m) => {
  const list = JSON.parse(m.data), seen = new Set();
  for (const a of list) {
    seen.add(a.id);
    let c = chars.get(a.id);
    if (!c) {
      c = makeChar(a); chars.set(a.id, c);
      c.snap = !ready; // on page load, place everyone directly; later arrivals walk in
      c.root.position.copy(a.parent ? (chars.get(a.parent)?.root.position ?? CREW_DOOR) : SPAWN);
    }
    if (ready && a.state === 'waiting' && c.data?.state !== 'waiting') alertWaiting(a);
    c.data = a;
  }
  for (const [id, c] of chars) if (!seen.has(id)) {
    scene.remove(c.root); c.el.remove(); if (c.line) scene.remove(c.line);
    chars.delete(id); if (focusId === id) focusId = null;
  }
  ready = true;
  renderPanel();
};

// ---------- alerts: desktop notification + horn ----------
let audio = null;
addEventListener('pointerdown', () => { audio ??= new AudioContext(); audio.resume(); });
function horn() {
  if (!S.sound || !audio) return;
  const t0 = audio.currentTime;
  for (const [f, s] of [[392, 0], [330, 0.32]]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + s);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + 0.28);
    o.connect(g).connect(audio.destination); o.start(t0 + s); o.stop(t0 + s + 0.3);
  }
}
function alertWaiting(a) {
  horn();
  // FR-09: never include command details in the notification
  if ('Notification' in window && Notification.permission === 'granted')
    new Notification('Tambang Agent', { body: `${displayName(a)} menunggu izin Anda`, tag: a.id });
}

// ---------- panel ----------
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}j ${String(m).padStart(2, '0')}m` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const today = () => new Date().toDateString();

function renderPanel() {
  const now = Date.now();
  const rows = [...chars.values()].map((c) => ({ a: c.data, v: viewOf(c.data, now) }))
    .sort((x, y) => RANK.indexOf(x.v) - RANK.indexOf(y.v) || displayName(x.a).localeCompare(displayName(y.a)));
  const count = (g) => rows.filter((r) => VIEW[r.v][2] === g).length;
  $('summary').innerHTML = [['wait', '⚠', 'menunggu'], ['work', '⛏', 'bekerja'], ['bad', '🌧', 'gangguan'], ['idle', '☕', 'idle']]
    .map(([g, i, t]) => `<span class="g-${g}"><b>${i} ${count(g)}</b> ${t}</span>`).join('');
  $('list').innerHTML = rows.length ? rows.map(({ a, v }) => {
    const [icon, label, g] = VIEW[v];
    return `<li data-id="${esc(a.id)}" class="g-${g}${focusId === a.id ? ' focused' : ''}">
      <span class="ico">${icon}</span>
      <div class="main"><b>${esc(displayName(a))}</b><small>${label}</small></div>
      <div class="meta"><span>${fmt(now - a.since)}</span><span title="${S.content ? '' : esc(a.tool || '')}">${S.content ? '•••' : esc(a.tool || '—')}</span><span>${a.day === today() ? a.ritase : 0} rit</span></div>
      <button class="rename" title="Ubah nama" ${S.content ? 'disabled' : ''}>✎</button></li>`;
  }).join('') : '<li class="empty">Belum ada agent.<br>Jalankan Claude Code, atau <code>npm run demo</code> untuk simulasi.</li>';

  const waiting = rows.filter((r) => r.v === 'waiting');
  $('alert').hidden = !waiting.length;
  $('alert').innerHTML = `<b>⚠ ${waiting.length} MENUNGGU ANDA</b><span>${waiting.map((r) => esc(displayName(r.a))).join(' · ')}</span>`;
  document.title = waiting.length ? `⚠ (${waiting.length}) Tambang Agent` : 'Tambang Agent';
  const total = rows.reduce((n, { a }) => n + (a.day === today() ? a.ritase : 0), 0);
  $('board').innerHTML = `<b>PAPAN PRODUKSI HARI INI</b><span>${total} ritase · ${rows.filter((r) => !r.a.parent).length} operator</span>`;
}
setInterval(renderPanel, 1000);

$('list').addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-id]'); if (!li) return;
  const a = chars.get(li.dataset.id)?.data; if (!a) return;
  if (ev.target.closest('.rename')) {
    const v = prompt(`Nama untuk "${a.name}" (kosongkan = nama folder):`, S.names[a.name] || '');
    if (v === null) return;
    if (v.trim()) S.names[a.name] = v.trim().slice(0, 40); else delete S.names[a.name];
    store.set('names', S.names);
  } else focusId = focusId === a.id ? null : a.id;
  renderPanel();
});
$('alert').addEventListener('click', () => {
  const w = [...chars.values()].find((c) => c.view === 'waiting'); if (w) { focusId = w.data.id; renderPanel(); }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') resetView(); });

// ---------- mouse: wheel = zoom, drag = pan, click a worker = focus, double-click = reset ----------
const view = { zoom: 1, pan: new THREE.Vector2() };
const canvas = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let drag = null;
function resetView() { focusId = null; view.zoom = 1; view.pan.set(0, 0); renderPanel(); }
function clampPan() {
  const hw = (camera.right - camera.left) / 2, hh = (camera.top - camera.bottom) / 2;
  view.pan.set(THREE.MathUtils.clamp(view.pan.x, -hw, hw), THREE.MathUtils.clamp(view.pan.y, -hh, hh));
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (focusId) { view.pan.copy(pan); view.zoom = camera.zoom; focusId = null; renderPanel(); }
  view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 1, 6);
}, { passive: false });
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved < 5) return;
  if (focusId) { view.pan.copy(pan); view.zoom = camera.zoom; focusId = null; renderPanel(); }
  const unit = (camera.right - camera.left) / camera.zoom / canvas.clientWidth; // world units per pixel
  view.pan.x -= dx * unit; view.pan.y += dy * unit; clampPan();
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('dragging');
  const click = drag && drag.moved < 5; drag = null;
  if (!click) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const hit = ray.intersectObjects([...chars.values()].map((c) => c.hit))[0];
  if (hit) { focusId = focusId === hit.object.userData.id ? null : hit.object.userData.id; renderPanel(); }
});
canvas.addEventListener('dblclick', resetView);

function setConn(ok) { $('conn').textContent = ok ? '● RELAY TERHUBUNG' : '● RELAY TERPUTUS'; $('conn').className = ok ? 'ok' : 'bad'; }

const THEMES = { auto: 'Otomatis', day: 'Siang', night: 'Malam' };
function renderControls() {
  $('btn-theme').textContent = `Tema: ${THEMES[S.theme]}`;
  $('btn-content').textContent = `Mode konten: ${S.content ? 'ON' : 'OFF'}`;
  $('btn-content').classList.toggle('on', S.content);
  $('content-badge').hidden = !S.content;
  $('btn-sound').textContent = `Klakson: ${S.sound ? 'ON' : 'OFF'}`;
  const np = 'Notification' in window ? Notification.permission : 'denied';
  $('btn-notif').textContent = { granted: 'Notifikasi: aktif', denied: 'Notifikasi: diblokir', default: 'Aktifkan notifikasi' }[np];
  $('btn-notif').disabled = np !== 'default';
}
$('btn-theme').onclick = () => { S.theme = { auto: 'day', day: 'night', night: 'auto' }[S.theme]; store.set('theme', S.theme); renderControls(); };
$('btn-content').onclick = () => { S.content = !S.content; store.set('content', S.content); pseudo.clear(); renderControls(); renderPanel(); };
$('btn-sound').onclick = () => { S.sound = !S.sound; store.set('sound', S.sound); renderControls(); };
$('btn-notif').onclick = () => Notification.requestPermission().then(renderControls);
renderControls();

// ---------- frame loop (rAF pauses by itself when the tab is hidden: NFR-05) ----------
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), pan = new THREE.Vector2(), want = new THREE.Vector2();
let night = -1;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime, now = Date.now();
  const { zones, trucks, excavators } = world;

  // 1. assign each agent a zone slot (stable order by id)
  const byZone = {};
  for (const c of chars.values()) { c.view = viewOf(c.data, now); (byZone[VIEW[c.view][3]] ??= []).push(c); }
  for (const [zone, list] of Object.entries(byZone)) {
    list.sort((x, y) => (x.data.id < y.data.id ? -1 : 1));
    list.forEach((c, i) => {
      c.slot = i;
      const slots = zones[zone].slots;
      const s = zone === 'truck' && i < trucks.length ? trucks[i].cab : slots[(zone === 'truck' ? i - trucks.length : i) % slots.length];
      c.target.copy(s); c.face = s.ry; c.sit = !!s.sit;
      if (zone === 'park') c.target.add(tmp.set(Math.sin(t * 0.45 + i * 2) * 1.1, 0, Math.cos(t * 0.45 + i * 2) * 0.8));
    });
  }

  // 2. move, pose, collect what the machines should do
  const excOn = [], truckOn = [];
  let waiting = false, radio = false, workshop = false;
  for (const c of chars.values()) {
    if (c.snap) { c.root.position.copy(c.target); c.snap = false; }
    tmp.subVectors(c.target, c.root.position);
    const dist = tmp.length();
    // shortcut: walks in a straight line (through pit benches); fine at this scale, add ramp routing if it bothers
    if (dist > 0.05) c.root.position.addScaledVector(tmp, Math.min(1, 9 * dt / dist));
    const riding = c.view === 'edit' && c.slot < trucks.length && dist < 0.9;
    if (riding) c.root.position.copy(c.target);
    c.body.visible = !riding;
    const moving = !riding && dist > 0.3;
    c.root.rotation.y = moving && Math.hypot(tmp.x, tmp.z) > 0.01 ? Math.atan2(tmp.x, tmp.z) : c.face ?? (c.view === 'mess' ? 0 : AZ);
    pose(c, t, moving);
    if (!moving) {
      if (c.view === 'bash' && c.slot < excavators.length) excOn[c.slot] = true;
      if (riding) truckOn[c.slot] = true;
      if (c.view === 'web') radio = true;
      if (c.view === 'error' || c.view === 'compact') workshop = true;
    }
    waiting ||= c.view === 'waiting';

    // floating label (FR-10); alternate heights so neighbours don't overlap
    const [icon, label, g] = VIEW[c.view];
    const html = `<i>${icon}</i><b>${esc(displayName(c.data))}</b>${g === 'wait' ? '<em>IZIN?</em>' : ''}`;
    if (html !== c.html) { c.el.innerHTML = html; c.html = html; }
    c.el.className = `label g-${g}${focusId === c.data.id ? ' focused' : ''}`;
    c.el.title = label;
    c.label.position.y = (c.view === 'mess' ? 1.1 : 2.1) + (c.slot % 2) * 0.6 - (riding ? 0.6 : 0);

    // dashed line from crew to its parent operator (FR-07)
    const parent = c.data.parent && chars.get(c.data.parent);
    if (parent) {
      if (!c.line) {
        c.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineDashedMaterial({ color: '#2f7cf6', dashSize: 0.4, gapSize: 0.25 }));
        c.line.frustumCulled = false; scene.add(c.line);
      }
      const pos = c.line.geometry.attributes.position;
      pos.setXYZ(0, c.root.position.x, c.root.position.y + 1, c.root.position.z);
      pos.setXYZ(1, parent.root.position.x, parent.root.position.y + 1, parent.root.position.z);
      pos.needsUpdate = true; c.line.computeLineDistances();
    }
    if (c.line) c.line.visible = !!parent;
  }

  excavators.forEach((e, i) => { e.update(dt, !!excOn[i]); if (excOn[i] && Math.random() < dt * 12) world.dust.emit(e.tipWorld, 0.5, 0.8); });
  trucks.forEach((tr, i) => tr.update(dt, !!truckOn[i]));

  // 3. day/night (FR-12): smooth blend, panel follows
  const hour = new Date().getHours();
  const goal = S.theme === 'day' ? 0 : S.theme === 'night' ? 1 : hour < 6 || hour >= 18 ? 1 : 0;
  night = night < 0 ? goal : night + (goal - night) * Math.min(1, dt * 1.5);
  document.documentElement.dataset.theme = goal ? 'night' : 'day';
  world.update(dt, { night, waiting, radio, workshop });

  // 4. camera: fixed iso view; panel click pans + zooms onto an agent (FR-06)
  const f = focusId && chars.get(focusId);
  if (f) { tmp.copy(f.root.position).applyMatrix4(baseInv); want.set(tmp.x - frameCenter.x, tmp.y - frameCenter.y); } else want.copy(view.pan);
  const k = Math.min(1, dt * 4);
  pan.lerp(want, k);
  camera.zoom += ((f ? Math.max(2.4, view.zoom) : view.zoom) - camera.zoom) * k;
  camera.position.copy(basePos).addScaledVector(camRight, pan.x).addScaledVector(camUp, pan.y);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  labels.render(scene, camera);
}
frame();
