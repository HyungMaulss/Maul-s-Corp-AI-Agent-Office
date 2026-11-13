// Static diorama + machines + effects. Everything is code-built boxes so it animates per part and shares one palette.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const AZ = THREE.MathUtils.degToRad(35); // camera azimuth; signs face it
export const SIZE = { w: 80, d: 60, top: 10 };  // ground footprint + tallest scenery; the camera frames this
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cache = new Map();
export const mat = (c) => cache.get(c) ?? cache.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c);

export function cube(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(BOX, typeof color === 'string' ? mat(color) : color);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m); return m;
}
const block = (p, w, h, d, c, x, y, z) => cube(p, w, h, d, c, x, y + h / 2, z); // y = bottom
const dyn = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.userData.dynamic = true; p.add(g); return g; };
function cyl(p, rt, rb, h, seg, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; p.add(m); return m;
}

// deterministic randomness: the scenery is identical on every load
let seed = 20261113;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];

function sign(parent, text, w, h, { bg = '#101010', fg = '#ffffff', glow = false, x = 0, y = 0, z = 0, ry = AZ } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8);
  let size = c.height * 0.6;
  const font = () => (g.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`);
  font(); while (g.measureText(text).width > c.width * 0.86) { size -= 2; font(); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    glow ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function signPost(p, text, x, z, { w = 2.4, bg = '#f2b705', fg = '#020202' } = {}) {
  block(p, 0.12, 1.8, 0.12, '#444', x, 0, z);
  sign(p, text, w, 0.7, { x, y: 2.1, z, bg, fg });
}

export const winMat = new THREE.MeshLambertMaterial({ color: '#2b3946', emissive: '#ffc861', emissiveIntensity: 0 });
const lampMat = new THREE.MeshLambertMaterial({ color: '#8a8a8a', emissive: '#ffe2a0', emissiveIntensity: 0 });
const strobeMat = new THREE.MeshBasicMaterial({ color: '#4a3000' }); // amber beacons on the moving vehicles

function building(p, { x, z, w, h, d, wall, roof, label }) {
  const g = new THREE.Group(); g.position.set(x, 0, z); p.add(g);
  block(g, w, h, d, wall, 0, 0, 0);
  block(g, w + 0.3, 0.25, d + 0.3, roof, 0, h, 0);
  const nx = Math.max(1, Math.floor(w / 1.7)), nz = Math.max(1, Math.floor(d / 1.7));
  for (let i = 0; i < nx; i++) cube(g, 0.8, 0.6, 0.05, winMat, -w / 2 + (i + 0.5) * w / nx, h * 0.6, d / 2 + 0.03);
  for (let i = 0; i < nz; i++) cube(g, 0.05, 0.6, 0.8, winMat, w / 2 + 0.03, h * 0.6, -d / 2 + (i + 0.5) * d / nz);
  if (label) sign(g, label, Math.min(w * 0.8, 4.2), 0.8, { y: h + 0.75, bg: '#ff7a00', fg: '#020202' });
  return g;
}

function lamp(p, x, z) {
  block(p, 0.15, 3.2, 0.15, '#4a4a4a', x, 0, z);
  cube(p, 0.5, 0.25, 0.5, lampMat, x, 3.3, z);
}

function tree(p, x, z, s = 1) {
  block(p, 0.25, 0.8 * s, 0.25, '#6b4a2b', x, 0, z);
  block(p, 1.3 * s, 0.9 * s, 1.3 * s, '#3f7d3a', x, 0.8 * s, z);
  block(p, 0.8 * s, 0.7 * s, 0.8 * s, '#4f9645', x, 1.7 * s, z);
}

// stepped low-poly mountain: rock faces at the base, forest on top
function hill(p, x, z, w, d, layers) {
  const cols = ['#7d6a55', '#8a7660', '#6f8f4d', '#5d8443', '#4b7337', '#3f6630'];
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const k = 1 - i / (layers + 0.5), h = 1.1 + rand() * 0.9;
    block(p, w * k + rand(), h, d * k + rand(), cols[Math.min(cols.length - 1, i)], x + (rand() - 0.5) * 0.8, y, z + (rand() - 0.5) * 0.8);
    y += h;
  }
}

function rocks(p, cx, cz, n, r = 2) {
  for (let i = 0; i < n; i++) {
    const s = 0.35 + rand() * 0.85, a = rand() * Math.PI * 2, d = rand() * r;
    const m = cube(p, s * (1 + rand() * 0.6), s * (0.6 + rand() * 0.5), s, pick(['#8f8a80', '#7a756c', '#a39d90', '#6e665c']), cx + Math.cos(a) * d, s * 0.25, cz + Math.sin(a) * d);
    m.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
  }
}

// mobile lighting plant aimed at a point
function lightTower(p, x, z, at) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(at.x - x, at.z - z); p.add(g);
  block(g, 1.1, 0.7, 1.8, '#f2b705', 0, 0.25, 0);
  for (const s of [-0.6, 0.6]) cube(g, 0.2, 0.5, 0.5, '#151515', s, 0.25, -0.3);
  block(g, 0.15, 5, 0.15, '#555', 0, 0.95, 0);
  const panel = cube(g, 1.6, 0.8, 0.15, lampMat, 0, 6.1, 0.1); panel.rotation.x = 0.35;
}

function heap(p, x, z, steps, color) {
  steps.reduce((y, [w, h, d]) => { block(p, w, h, d, color, x, y, z); return y + h; }, 0);
}

function ring(p, ow, od, iw, id, top, color) {
  const h = top + 4, sd = (od - id) / 2, sw = (ow - iw) / 2;
  block(p, ow, h, sd, color, 0, -4, -id / 2 - sd / 2);
  block(p, ow, h, sd, color, 0, -4, id / 2 + sd / 2);
  block(p, sw, h, id, color, -iw / 2 - sw / 2, -4, 0);
  block(p, sw, h, id, color, iw / 2 + sw / 2, -4, 0);
}

const gridSlots = (cx, y, cz, cols, sp = 1.4, n = 12) =>
  Array.from({ length: n }, (_, i) => v3(cx + ((i % cols) - (cols - 1) / 2) * sp, y, cz + Math.floor(i / cols) * sp));

// ---------- machines tied to agent state ----------
function excavator(p, x, y, z, ry) {
  const g = dyn(p, x, y, z); g.rotation.y = ry;
  cube(g, 0.5, 0.5, 2.0, '#2a2a2a', -0.6, 0.25, 0); cube(g, 0.5, 0.5, 2.0, '#2a2a2a', 0.6, 0.25, 0);
  const upper = new THREE.Group(); upper.position.y = 0.5; g.add(upper);
  cube(upper, 1.5, 0.7, 1.5, '#f2b705', 0, 0.35, -0.1);
  cube(upper, 0.65, 0.8, 0.65, '#f2b705', -0.4, 1.1, 0.3);
  cube(upper, 0.67, 0.4, 0.5, '#1d2a33', -0.4, 1.2, 0.36);
  cube(upper, 1.5, 0.5, 0.4, '#3a3a3a', 0, 0.45, -0.95);
  const boom = new THREE.Group(); boom.position.set(0.35, 0.8, 0.5); upper.add(boom);
  cube(boom, 0.28, 0.28, 1.9, '#f2b705', 0, 0, 0.95);
  const arm = new THREE.Group(); arm.position.z = 1.9; boom.add(arm);
  cube(arm, 0.22, 0.22, 1.4, '#f2b705', 0, 0, 0.7);
  const bucket = new THREE.Group(); bucket.position.z = 1.4; arm.add(bucket);
  cube(bucket, 0.6, 0.45, 0.4, '#3a3a3a', 0, -0.1, 0.15);
  const tip = new THREE.Object3D(); tip.position.set(0, -0.3, 0.3); bucket.add(tip);
  const ex = { g, slot: v3(), tipWorld: v3(), phase: Math.random() * 6 };
  ex.update = (dt, on) => {
    if (on) ex.phase += dt;
    const t = ex.phase;
    upper.rotation.y = on ? Math.sin(t * 0.7) * 0.5 : upper.rotation.y;
    boom.rotation.x = -0.75 + Math.sin(t * 1.4) * 0.25;
    arm.rotation.x = 1.5 + Math.sin(t * 1.4 + 1) * 0.4;
    bucket.rotation.x = 0.6 + Math.sin(t * 1.4 + 2) * 0.5;
    tip.getWorldPosition(ex.tipWorld);
  };
  g.updateMatrixWorld(true); ex.slot = g.localToWorld(v3(-1.5, 0, -0.4)); ex.update(0, false);
  return ex;
}

function truck(p, path, phase) {
  const g = dyn(p);
  cube(g, 1.2, 0.4, 2.8, '#2a2a2a', 0, 0.6, 0);
  for (const [wx, wz] of [[-0.7, 0.9], [0.7, 0.9], [-0.7, -0.8], [0.7, -0.8]]) cube(g, 0.35, 0.75, 0.75, '#151515', wx, 0.38, wz);
  cube(g, 1.2, 0.85, 0.8, '#f4f4f4', 0, 1.2, 1.0);
  cube(g, 1.22, 0.35, 0.4, '#1d2a33', 0, 1.35, 1.25);
  cube(g, 1.22, 0.12, 0.82, '#ff7a00', 0, 0.85, 1.0); // Maul's Corp stripe
  const bed = new THREE.Group(); bed.position.set(0, 0.85, -1.4); g.add(bed);
  cube(bed, 1.4, 0.75, 1.9, '#ff7a00', 0, 0.38, 0.95);
  const T = path.length / 3, cycle = 2 * T + 3;
  const tr = { g, phase: phase * cycle, cab: v3(), ritase: 0 };
  const look = v3();
  tr.update = (dt, on) => {
    if (on) tr.phase += dt;
    const c = tr.phase % cycle;
    let s, dump = 0;
    if (c < 1.5) s = 0;
    else if (c < 1.5 + T) s = (c - 1.5) / T;
    else if (c < 3 + T) { s = 1; dump = Math.sin(Math.PI * (c - 1.5 - T) / 1.5); }
    else s = 1 - (c - 3 - T) / T; // reverses back down to the loading point
    g.position.copy(path.at(s));
    look.copy(path.at(Math.min(1, Math.max(0, s + 0.01 * (s >= 1 ? -1 : 1))))).sub(g.position);
    if (look.lengthSq() > 1e-6) g.lookAt(look.multiplyScalar(s >= 1 ? -1 : 1).add(g.position)); // nose points toward the dump end
    bed.rotation.x = -dump * 0.7;
    g.updateMatrixWorld();
    tr.cab.set(0, 1.0, 1.0).applyMatrix4(g.matrixWorld);
  };
  tr.update(0, false);
  return tr;
}

function makePath(pts) {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = lens.at(-1), out = v3();
  return {
    length: L,
    at(s) {
      const d = s * L; let i = 1;
      while (i < pts.length - 1 && lens[i] < d) i++;
      return out.lerpVectors(pts[i - 1], pts[i], (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1));
    },
  };
}

// ---------- ambient site traffic (not tied to agents; slow so it never competes with the STOP portal) ----------
const wheel = (g, x, y, z, r = 0.38, w = 0.3) => cube(g, w, r * 2, r * 2, '#151515', x, y, z);

/** Drives g along pts at `speed` m/s. loop: closed circuit; otherwise shuttles back and forth (backUp: reverses without turning). */
function drive(g, pts, speed, { loop = false, backUp = false } = {}) {
  const path = makePath(loop ? [...pts, pts[0]] : pts), pos = v3(), dir = v3();
  const st = { d: rand() * path.length, fwd: true };
  st.update = (dt) => {
    st.d += speed * dt;
    const L = path.length;
    let s;
    if (loop) s = (st.d % L) / L;
    else { const c = st.d % (2 * L); st.fwd = c < L; s = st.fwd ? c / L : 2 - c / L; }
    pos.copy(path.at(s));
    dir.copy(path.at(Math.min(1, Math.max(0, s + (st.fwd ? 0.002 : -0.002))))).sub(pos);
    if (backUp && !st.fwd) dir.negate();
    g.position.copy(pos);
    dir.y = 0;
    if (dir.lengthSq() > 1e-8) g.rotation.y = Math.atan2(dir.x, dir.z);
  };
  return st;
}

function lightVehicle(p) { // LV pickup with buggy-whip flag and amber strobe
  const g = dyn(p);
  block(g, 1.1, 0.5, 2.2, '#f4f4f4', 0, 0.3, 0);
  block(g, 1.05, 0.5, 1.0, '#f4f4f4', 0, 0.8, 0.25);
  cube(g, 1.07, 0.3, 0.9, '#1d2a33', 0, 1.1, 0.25);
  cube(g, 1.12, 0.1, 2.22, '#ff7a00', 0, 0.55, 0);
  for (const [x, z] of [[-0.55, 0.7], [0.55, 0.7], [-0.55, -0.7], [0.55, -0.7]]) wheel(g, x, 0.3, z, 0.3, 0.2);
  block(g, 0.04, 2, 0.04, '#dddddd', 0.45, 0.8, -1.0); cube(g, 0.02, 0.25, 0.4, '#ff7a00', 0.45, 2.65, -0.8);
  cube(g, 0.3, 0.12, 0.2, strobeMat, 0, 1.36, 0.25);
  return g;
}

function waterTruck(p) {
  const g = dyn(p);
  cube(g, 1.2, 0.4, 3.2, '#2a2a2a', 0, 0.6, 0);
  for (const z of [1.15, -0.6, -1.3]) for (const x of [-0.7, 0.7]) wheel(g, x, 0.38, z);
  cube(g, 1.2, 0.85, 0.9, '#f4f4f4', 0, 1.2, 1.15); cube(g, 1.22, 0.35, 0.4, '#1d2a33', 0, 1.35, 1.45);
  const tank = cyl(g, 0.62, 0.62, 2.2, 12, '#2f7cf6', 0, 1.42, -0.55); tank.rotation.x = Math.PI / 2;
  cube(g, 0.3, 0.12, 0.2, strobeMat, 0, 1.68, 1.15);
  return g;
}

function grader(p) {
  const g = dyn(p);
  cube(g, 0.5, 0.35, 3.6, '#f2b705', 0, 0.9, 0.4);
  cube(g, 1.3, 0.8, 1.3, '#f2b705', 0, 0.9, -1.1);
  cube(g, 1.1, 0.8, 0.9, '#f2b705', 0, 1.7, -0.5); cube(g, 1.12, 0.4, 0.92, '#1d2a33', 0, 1.8, -0.5);
  cube(g, 2.4, 0.45, 0.12, '#555555', 0, 0.35, 0.5); // moldboard
  for (const z of [2.0, -0.9, -1.6]) for (const x of [-0.65, 0.65]) wheel(g, x, 0.38, z);
  cube(g, 0.3, 0.12, 0.2, strobeMat, 0, 2.18, -0.5);
  return g;
}

function dozer(p) {
  const g = dyn(p);
  for (const x of [-0.75, 0.75]) cube(g, 0.45, 0.6, 2.2, '#2a2a2a', x, 0.3, 0);
  cube(g, 1.3, 0.8, 1.8, '#f2b705', 0, 0.95, -0.1);
  cube(g, 0.9, 0.8, 0.8, '#f2b705', 0, 1.75, -0.45); cube(g, 0.92, 0.35, 0.82, '#1d2a33', 0, 1.85, -0.45);
  cube(g, 2.3, 0.85, 0.15, '#4a4a4a', 0, 0.45, 1.45);
  for (const x of [-0.6, 0.6]) cube(g, 0.12, 0.12, 0.6, '#3a3a3a', x, 0.6, 1.1);
  return g;
}

function wheelLoader(p) {
  const g = dyn(p);
  cube(g, 1.4, 0.9, 1.6, '#f2b705', 0, 1.0, -0.6);
  cube(g, 1.0, 0.9, 0.9, '#f2b705', 0, 1.9, -0.3); cube(g, 1.02, 0.4, 0.92, '#1d2a33', 0, 2.0, -0.3);
  cube(g, 1.0, 0.6, 1.0, '#f2b705', 0, 0.9, 0.7);
  for (const z of [0.8, -0.9]) for (const x of [-0.8, 0.8]) wheel(g, x, 0.55, z, 0.55, 0.35);
  const arm = new THREE.Group(); arm.position.set(0, 1.3, 0.5); g.add(arm);
  for (const x of [-0.45, 0.45]) cube(arm, 0.15, 0.15, 1.5, '#f2b705', x, 0, 0.75);
  cube(arm, 1.7, 0.7, 0.6, '#3a3a3a', 0, -0.2, 1.6);
  return { g, arm };
}

function conveyor(p, a, b, n = 10) {
  const g = new THREE.Group(); g.position.copy(a); p.add(g); g.lookAt(b);
  const L = a.distanceTo(b);
  cube(g, 0.9, 0.12, L, '#3a3a3a', 0, 0, L / 2);
  for (const x of [-0.48, 0.48]) cube(g, 0.08, 0.22, L, '#f2b705', x, 0.06, L / 2);
  for (let k = 1; k < 4; k++) { const q = a.clone().lerp(b, k / 4); block(p, 0.2, q.y, 0.2, '#555', q.x, 0, q.z); }
  const items = dyn(g);
  const chunks = Array.from({ length: n }, () => cube(items, 0.35, 0.25, 0.35, '#1c1c1c', 0, 0.18, 0));
  return (t) => chunks.forEach((c, i) => { c.position.z = (t * 1.2 + i * L / n) % L; });
}

// ---------- particles (dust / smoke / water spray) ----------
function puffs(scene, color, size, n = 160) {
  const pos = new Float32Array(n * 3).fill(-999), vel = new Float32Array(n * 3), life = new Float32Array(n);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.75, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  let next = 0;
  return {
    emit(p, spread = 0.4, up = 1.2) {
      const i = next++ % n;
      pos.set([p.x + (Math.random() - 0.5) * spread, p.y, p.z + (Math.random() - 0.5) * spread], i * 3);
      vel.set([(Math.random() - 0.5) * 0.6, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6], i * 3);
      life[i] = 1.6;
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Static scenery is ~1000 boxes; merging them per material cuts draw calls to a few dozen (NFR-05 on integrated GPUs).
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const walk = (o) => {
    if (o.userData.dynamic) return;
    if (o.isMesh) {
      const k = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      (buckets.get(k) ?? buckets.set(k, []).get(k)).push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld)));
    if (!geo) continue; // incompatible attributes: keep the originals
    const m = new THREE.Mesh(geo, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
    for (const o of list) o.removeFromParent();
    root.add(m);
  }
}

// ---------- the diorama ----------
export function buildWorld(scene) {
  const W = new THREE.Group(); scene.add(W);

  // lights: one shadow-casting sun + hemisphere fill (cheap enough for integrated GPUs)
  const hemi = new THREE.HemisphereLight('#ffffff', '#9c8160', 2.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(-20, 40, 25); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ground with terraced pit (benches 1 m deep, 2 m wide), base slab
  block(W, SIZE.w + 0.6, 0.6, SIZE.d + 0.6, '#2a1f17', 0, -4.6, 0);
  ring(W, SIZE.w, SIZE.d, 22, 16, 0, '#c9a46c');
  ring(W, 22, 16, 18, 12, -1, '#b58c5c');
  ring(W, 18, 12, 14, 8, -2, '#9b754c');
  block(W, 14, 1, 8, '#86623f', 0, -4, 0);
  cube(W, 2.6, 0.06, 1.6, '#4c6c7c', -0.5, -2.97, 1.6); // sump puddle
  const ramp = cube(W, Math.hypot(6, 3), 0.3, 2.6, '#8d7f6c', 8.07, -1.63, 0);
  ramp.rotation.z = Math.atan2(3, 6);

  // roads
  const road = '#8d7f6c';
  block(W, 3, 0.04, 45.5, road, -30, 0, 6.75);    // gate -> STOP portal
  block(W, 67.5, 0.04, 2, road, 2.25, 0, 13);     // front cross road
  block(W, 51.5, 0.04, 2, road, -5.75, 0, -11);   // back road: STOP, office, radio, hauling
  block(W, 9.7, 0.04, 2.6, road, 15.85, 0, 0);    // ramp top -> hauling road
  block(W, 2.6, 0.04, 31.3, road, 20, 0, -2.65);  // hauling road
  block(W, 5, 0.04, 2.6, road, 22.5, 0, -17);     // disposal spur
  block(W, 8.7, 0.04, 2.6, road, 25.05, 0, -6);   // crusher spur

  // STOP portal — the brightest thing on screen at any time (unlit materials)
  const portal = new THREE.Group(); portal.position.set(-30, 0, -16); W.add(portal);
  const stripe = '#f4f4f4';
  block(portal, 0.4, 4.2, 0.4, stripe, -2.4, 0, 0); block(portal, 0.4, 4.2, 0.4, stripe, 2.4, 0, 0);
  block(portal, 5.2, 0.45, 0.45, '#d81414', 0, 4.2, 0);
  sign(portal, 'STOP', 2.8, 1.15, { bg: '#d81414', fg: '#ffffff', glow: true, y: 3.25, z: 0.25, ry: 0 });
  const padMat = new THREE.MeshBasicMaterial({ color: '#4a3d00' });
  const pad = cube(W, 6, 0.06, 4, padMat, -30, 0.05, -13.2); pad.receiveShadow = false;
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const headMat = new THREE.MeshBasicMaterial({ color: '#6b5a00' });
  const rotators = [-2.4, 2.4].map((x) => {
    cube(portal, 0.5, 0.45, 0.5, headMat, x, 4.9, 0);
    const spin = dyn(portal, x, 4.9, 0);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 16, 1, true), beamMat);
    beam.rotation.z = Math.PI / 2; beam.position.x = 2; spin.add(beam);
    return spin;
  });

  // office: cutaway (tall back/left walls, low front/right walls) so the desks stay visible from the fixed camera
  const OX = -14, OZ = -18;
  const of = new THREE.Group(); of.position.set(OX, 0, OZ); W.add(of);
  const wall = '#e9e4d8', trim = '#ff7a00';
  block(of, 14, 0.04, 8, '#cfc9bc', 0, 0, 0);                 // tiled floor
  block(of, 14.4, 3, 0.2, wall, 0, 0, -4.1);                  // back
  block(of, 0.2, 3, 8.2, wall, -7.1, 0, 0);                   // left
  for (const x of [-4, 4]) { block(of, 6.4, 0.7, 0.2, wall, x, 0, 4.1); block(of, 6.4, 0.08, 0.26, trim, x, 0.7, 4.1); } // front, door gap in the middle
  block(of, 0.2, 0.7, 8.2, wall, 7.1, 0, 0); block(of, 0.26, 0.08, 8.2, trim, 7.1, 0.7, 0); // right
  for (const x of [-5.5, -3.5, 3.5, 5.5]) cube(of, 1.4, 0.9, 0.05, winMat, x, 1.9, -3.98);
  for (const z of [-1.5, 1.5]) cube(of, 0.05, 0.9, 1.4, winMat, -6.98, 1.9, z);
  sign(of, 'MINE PLAN', 3, 1.5, { y: 1.9, z: -3.97, bg: '#f4f1e8', fg: '#1f3b57', ry: 0 });
  sign(of, 'KANTOR TAMBANG', 5, 0.8, { y: 3.6, z: -4.1, bg: trim, fg: '#020202' });
  for (const z of [-2.8, -1.7]) block(of, 0.6, 1.4, 1, '#7d8a94', -6.6, 0, z); // filing cabinets
  block(of, 0.45, 1.1, 0.45, '#dfe7ee', -6.6, 0, 3.2); cube(of, 0.3, 0.35, 0.3, '#4aa3df', -6.6, 1.28, 3.2); // water dispenser
  block(of, 0.5, 0.5, 0.5, '#8a5a35', 6.4, 0, -3.5); block(of, 0.7, 0.8, 0.7, '#3f7d3a', 6.4, 0.5, -3.5); // plant
  const screenMat = new THREE.MeshBasicMaterial({ color: '#5aa0d8' }); // unlit so screens glow at night
  const deskSlots = [];
  for (const z of [-1.5, 2]) for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    block(of, 1.8, 0.08, 0.9, '#8a6a4a', x, 0.72, z);                       // desk top
    for (const s of [-0.85, 0.85]) block(of, 0.08, 0.72, 0.85, '#3a3a3a', x + s, 0, z);
    block(of, 0.12, 0.3, 0.12, '#222222', x, 0.8, z - 0.25);                // monitor stand
    cube(of, 0.95, 0.58, 0.06, '#151515', x, 1.4, z - 0.27);                // bezel
    cube(of, 0.85, 0.48, 0.02, screenMat, x, 1.4, z - 0.235);               // screen faces the worker (+z)
    cube(of, 0.6, 0.03, 0.2, '#2a2a2a', x, 0.81, z + 0.15);                 // keyboard
    block(of, 0.08, 0.42, 0.08, '#333333', x, 0, z + 0.85);                 // chair post
    block(of, 0.6, 0.1, 0.6, '#1f3b57', x, 0.42, z + 0.85);                 // seat
    block(of, 0.6, 0.7, 0.1, '#1f3b57', x, 0.52, z + 1.15);                 // backrest
    deskSlots.push(Object.assign(v3(OX + x, 0, OZ + z + 0.85), { ry: Math.PI, sit: true }));
  }

  // mess
  building(W, { x: 24, z: 18.5, w: 8, h: 2.6, d: 3, wall: '#dfe7ee', roof: '#2f6db5', label: 'MESS' });
  const bedSlots = [];
  for (let i = 0; i < 5; i++) {
    const x = 20.8 + i * 1.6;
    block(W, 1.0, 0.3, 2.1, '#3a3a3a', x, 0, 21.5); block(W, 0.9, 0.15, 2.0, '#f2f2f2', x, 0.3, 21.5);
    block(W, 0.8, 0.12, 0.4, '#9fc3e8', x, 0.45, 20.7);
    bedSlots.push(v3(x, 0.5, 22.4));
  }

  // workshop: open shed facing the camera
  const ws = new THREE.Group(); ws.position.set(30, 0, 4); W.add(ws);
  block(ws, 6, 3.2, 0.3, '#7d8a94', 0, 0, -2.4);
  block(ws, 0.3, 3.2, 5, '#7d8a94', -3, 0, 0);
  block(ws, 6.4, 0.25, 5.4, '#3b4650', 0, 3.2, 0);
  sign(ws, 'WORKSHOP', 3.6, 0.75, { y: 4, bg: '#ff7a00', fg: '#020202' });
  for (const [x, z] of [[-2.2, -1.6], [-1.6, -1.8], [-2.3, -0.9]]) block(ws, 0.55, 0.85, 0.55, '#a33a2a', x, 0, z); // oil drums
  block(ws, 2, 0.9, 0.7, '#5a4632', 1.2, 0, -1.8); // tool bench
  const smokeAt = v3(29, 1.2, 4.8);

  // fuel station: canopy, horizontal tank, pump island, parked fuel truck
  const fs = new THREE.Group(); fs.position.set(24.5, 0, 8); W.add(fs);
  for (const [x, z] of [[-2, -1.4], [2, -1.4], [-2, 1.4], [2, 1.4]]) block(fs, 0.2, 3, 0.2, '#dddddd', x, 0, z);
  block(fs, 4.8, 0.3, 3.6, '#d81414', 0, 3, 0);
  sign(fs, 'BBM', 1.6, 0.6, { y: 3.75, bg: '#d81414', fg: '#ffffff' });
  block(fs, 0.6, 1.2, 0.5, '#f4f4f4', 0, 0, 0); cube(fs, 0.62, 0.25, 0.52, '#d81414', 0, 0.9, 0);
  for (const x of [-1, 1]) block(fs, 0.3, 0.6, 0.9, '#555', x * 1.6 + 0, 0, -3.2);
  cyl(fs, 0.8, 0.8, 3.6, 14, '#f4f4f4', 0, 1.3, -3.2).rotation.z = Math.PI / 2;
  const ft = new THREE.Group(); ft.position.set(27.8, 0, 10.3); ft.rotation.y = -Math.PI / 2; W.add(ft);
  cube(ft, 1.2, 0.4, 3, '#2a2a2a', 0, 0.6, 0);
  for (const z of [1.0, -0.8]) for (const x of [-0.7, 0.7]) wheel(ft, x, 0.38, z);
  cube(ft, 1.2, 0.85, 0.9, '#f4f4f4', 0, 1.2, 1.05); cube(ft, 1.22, 0.35, 0.4, '#1d2a33', 0, 1.35, 1.35);
  cyl(ft, 0.6, 0.6, 1.9, 12, '#f4f4f4', 0, 1.4, -0.5).rotation.x = Math.PI / 2;
  cube(ft, 1.24, 0.15, 1.9, '#d81414', 0, 1.4, -0.5);

  // crusher -> conveyor -> coal stockpile
  const cr = new THREE.Group(); cr.position.set(31, 0, -6); W.add(cr);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) block(cr, 0.3, 1.6, 0.3, '#555', x, 0, z);
  block(cr, 3.2, 1.8, 3.2, '#7d8a94', 0, 1.6, 0);
  cyl(cr, 2.1, 0.9, 1.4, 4, '#5d6a74', 0, 4.1, 0).rotation.y = Math.PI / 4; // hopper
  sign(cr, 'CRUSHER', 3, 0.7, { y: 5.4, bg: '#ff7a00', fg: '#020202' });
  heap(W, 36, -14, [[6, 1.1, 5], [4.4, 1.1, 3.6], [2.8, 1, 2.2], [1.4, 0.8, 1.2]], '#2b2b2b');
  const belt = conveyor(W, v3(32, 2.8, -7.6), v3(36, 4.4, -13.4));

  // canteen: roof on posts
  const kt = new THREE.Group(); kt.position.set(-16, 0, 19); W.add(kt);
  for (const [x, z] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2]]) block(kt, 0.2, 2.6, 0.2, '#555', x, 0, z);
  block(kt, 5.8, 0.2, 4.6, '#c0392b', 0, 2.6, 0);
  sign(kt, 'KANTIN', 2.6, 0.7, { y: 3.4, bg: '#ff7a00', fg: '#020202' });
  for (const x of [-1.3, 1.3]) { block(kt, 1.6, 0.75, 0.9, '#8a5a35', x, 0, -0.3); block(kt, 0.25, 0.25, 0.25, '#f4f4f4', x, 0.75, -0.3); }

  // gym
  const gym = new THREE.Group(); gym.position.set(-6, 0, 19); W.add(gym);
  block(gym, 5, 0.12, 4.2, '#2c2c2c', 0, 0, 0);
  sign(gym, 'GYM', 1.6, 0.7, { y: 3, x: -1.6, z: -1.6, bg: '#ff7a00', fg: '#020202' });
  block(gym, 0.12, 2.6, 0.12, '#555', -1.6, 0, -1.6);
  for (const x of [-1.2, 1.2]) { block(gym, 0.15, 1.2, 0.15, '#666', x - 0.6, 0.12, -1.4); block(gym, 0.15, 1.2, 0.15, '#666', x + 0.6, 0.12, -1.4); cube(gym, 1.6, 0.08, 0.08, '#999', x, 1.3, -1.4); }

  // park
  const park = new THREE.Group(); park.position.set(3, 0, 19); W.add(park);
  block(park, 5, 0.12, 4.2, '#6a9a4a', 0, 0, 0);
  tree(park, -1.8, -1.4); tree(park, 1.9, -1.2, 1.2); tree(park, 1.6, 1.5, 0.8);
  block(park, 1.6, 0.45, 0.5, '#8a5a35', -1.4, 0.12, 1.4);

  // settling pond (kolam pengendapan) with rocky banks
  block(W, 8.6, 0.06, 5.6, '#6b5a45', 11.5, 0, 19.5);
  cube(W, 8, 0.06, 5, '#3f6f86', 11.5, 0.07, 19.5);
  for (const [x, z] of [[7.5, 17], [15.5, 22], [15.5, 17.2]]) rocks(W, x, z, 4, 0.8);
  signPost(W, 'KOLAM', 8, 22.8, { w: 1.6 });

  // radio tower
  const tw = new THREE.Group(); tw.position.set(6, 0, -20); W.add(tw);
  [[1.2, 1.8, '#d81414'], [0.95, 1.8, '#f4f4f4'], [0.7, 1.8, '#d81414'], [0.45, 1.8, '#f4f4f4']]
    .reduce((y, [s, h, c]) => { block(tw, s, h, s, c, 0, y, 0); return y + h; }, 0);
  block(tw, 0.08, 1.2, 0.08, '#333', 0, 7.2, 0);
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#400' });
  cube(tw, 0.35, 0.35, 0.35, beaconMat, 0, 8.5, 0);
  block(W, 1.8, 1.2, 1.4, '#e9e4d8', 7.8, 0, -20); // radio hut

  // survey post: tripod + theodolite, sample drill rig
  const sv = new THREE.Group(); sv.position.set(-20, 0, 2); W.add(sv);
  for (const a of [0, 2.1, 4.2]) { const l = cube(sv, 0.06, 1.4, 0.06, '#c9a227', Math.sin(a) * 0.3, 0.65, Math.cos(a) * 0.3); l.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); }
  cube(sv, 0.3, 0.3, 0.3, '#f2b705', 0, 1.45, 0);
  block(sv, 0.9, 4.5, 0.9, '#ff7a00', -2.2, 0, -1.6);
  block(sv, 1.8, 0.5, 1.4, '#3a3a3a', -2.2, 0, -1.6);

  // disposal heap (overburden)
  heap(W, 26.7, -19, [[6, 0.9, 5], [4.6, 0.9, 3.8], [3.2, 0.9, 2.6], [1.8, 0.7, 1.5]], '#a07a52');

  // gate + bus
  const gate = new THREE.Group(); gate.position.set(-30, 0, 27.5); W.add(gate);
  block(gate, 0.4, 3.6, 0.4, '#3a3a3a', -2, 0, 0); block(gate, 0.4, 3.6, 0.4, '#3a3a3a', 2, 0, 0);
  sign(gate, "MAUL'S CORP", 4.4, 0.9, { y: 3.9, bg: '#020202', fg: '#ff7a00', ry: 0 });
  const bus = new THREE.Group(); bus.position.set(-24, 0, 23.5); W.add(bus);
  block(bus, 5.2, 1.9, 2, '#f4f4f4', 0, 0.35, 0);
  block(bus, 5.22, 0.25, 2.02, '#ff7a00', 0, 0.9, 0);
  block(bus, 4.6, 0.5, 2.04, '#1d2a33', 0.2, 1.45, 0);
  for (const x of [-1.7, 1.7]) for (const z of [-0.95, 0.95]) cube(bus, 0.7, 0.7, 0.2, '#151515', x, 0.35, z);

  // safety signs + cones
  signPost(W, 'UTAMAKAN K3', -27.4, 22, { w: 2.6 });
  signPost(W, 'MAX 30 KM/J', 22.2, -9, { w: 2.4, bg: '#f4f4f4', fg: '#d81414' });
  signPost(W, 'AREA PELEDAKAN', -7, 10.2, { w: 3, bg: '#d81414', fg: '#ffffff' });
  for (const x of [14, 15.2, 16.4, 17.6]) { block(W, 0.3, 0.5, 0.3, '#ff7a00', x, 0, 11.4); cube(W, 0.32, 0.08, 0.32, '#f4f4f4', x, 0.3, 11.4); }

  // scenery: mountains along the back and left edges (never in front of the camera), rocks, trees, lamps
  for (let x = -36; x <= 36; x += 8.5 + rand() * 2) hill(W, x, -27 + rand(), 8 + rand() * 3, 4.6, 3 + Math.floor(rand() * 4));
  for (let z = -18; z <= 6; z += 8) hill(W, -37, z + rand() * 2, 4.6, 7 + rand() * 2, 2 + Math.floor(rand() * 3));
  for (const [x, z, n, r] of [[-14, 5, 5, 2], [14, -5, 5, 2], [-14, -6, 4, 1.8], [13.5, 6.5, 3, 1.2], [-36, 13, 6, 2.5], [-35.5, 22, 5, 2],
    [34, -22, 5, 2], [16, -24, 5, 2.2], [-4, -24, 4, 2], [37.5, 2, 4, 1.5], [-24, 9, 4, 2], [0, 25.5, 4, 2], [-37, 27, 4, 1.5],
    [37, 20, 5, 2], [12, -15, 4, 1.5], [-8, -14, 3, 1], [24, -12.5, 3, 1.2], [34.5, 14, 4, 1.8]]) rocks(W, x, z, n, r);
  for (const [x, z, s] of [[-38, 28], [-36, 18, 1.2], [38, 28], [36, 25, 1.3], [38.5, 9], [16, 25], [-10, 25.5], [8, 26.5], [30, 26.5, 1.2],
    [-20, 26], [-38.5, -26], [26, 24.5], [38.5, -6, 0.9], [-26, -6, 0.8], [2, -15.5, 0.8], [-38, 10]]) tree(W, x, z, s ?? 1);
  for (const [x, z] of [[-27.8, -4], [-27.8, 8], [-10, 11.4], [9, 11.4], [22.2, -3], [-2, -12.8], [22.2, 15.2]]) lamp(W, x, z);
  for (const [x, z] of [[-14, -8.6], [14, -8.6], [-14, 9.6], [14, 9.6]]) lightTower(W, x, z, v3(0, 0, 0));

  // machines tied to agent state
  const excavators = [excavator(W, -2.6, -3, -1.6, Math.PI / 2), excavator(W, -2.6, -3, 1.6, Math.PI / 2), excavator(W, 3.6, -3, -2.2, -Math.PI / 2)];
  const haul = makePath([v3(1.4, -3, 0), v3(5, -3, 0), v3(11, 0, 0), v3(20, 0, 0), v3(20, 0, -17), v3(23.5, 0, -17)]);
  const trucks = [0.05, 0.4, 0.75].map((ph) => truck(W, haul, ph));

  // ambient traffic
  const lv = lightVehicle(W), wt = waterTruck(W), loader = wheelLoader(W);
  const lvDrive = drive(lv, [v3(-29.4, 0, 12.4), v3(-29.4, 0, -10.4), v3(19.4, 0, -10.4), v3(19.4, 0, 12.4)], 4.5, { loop: true });
  const wtDrive = drive(wt, [v3(-28, 0, 13.4), v3(33, 0, 13.4)], 2.2);
  const loaderDrive = drive(loader.g, [v3(31.8, 0, -9.2), v3(34, 0, -11.6)], 0.9, { backUp: true });
  const ambient = [lvDrive, wtDrive, loaderDrive,
    drive(grader(W), [v3(-26, 0, -11.4), v3(14, 0, -11.4)], 1.3),
    drive(dozer(W), [v3(24, 0, -22.7), v3(29.5, 0, -22.7)], 1.1, { backUp: true })];
  const spray = puffs(scene, '#cfe9ff', 6), sprayAt = v3();

  // zones: where each visual state stands. Slots beyond the list overflow into the zone's grid.
  // A slot may carry `ry` (facing) and `sit` (seated pose).
  const zones = {
    stop: { slots: gridSlots(-30, 0, -13.6, 4, 1.4) },
    pit: { slots: [...excavators.map((e) => e.slot), ...gridSlots(0, -3, -0.5, 3, 1.3)] },
    truck: { slots: gridSlots(17, 0, 3.4, 3, 1.3) }, // overflow only; trucks come first
    survey: { slots: [v3(-19.5, 0, 2.9), ...gridSlots(-19, 0, 4.1, 3, 1.3)] },
    radio: { slots: gridSlots(6.2, 0, -17.6, 3, 1.3) },
    office: { slots: [...deskSlots, ...gridSlots(OX, 0, -12.2, 4, 1.2)] },
    workshop: { slots: gridSlots(30.3, 0, 4.4, 3, 1.4) },
    shelter: { slots: gridSlots(-16, 0, 20.4, 4, 1.2) },
    canteen: { slots: [v3(-17.3, 0, 18), v3(-14.7, 0, 18), v3(-17.3, 0, 19.6), v3(-14.7, 0, 19.6), ...gridSlots(-16, 0, 17.2, 4, 1.2)] },
    gym: { slots: gridSlots(-6, 0.12, 19.2, 3, 1.4) },
    park: { slots: gridSlots(3, 0.12, 18.4, 3, 1.5) },
    mess: { slots: [...bedSlots, ...gridSlots(24, 0, 16, 4, 1.3)] },
    delegate: { slots: gridSlots(24, 0, 15.6, 4, 1.3) },
    bus: { slots: gridSlots(-24, 0, 25, 5, 0.9) },
  };

  mergeStatic(W);

  const dust = puffs(scene, '#c7a67a', 9), smoke = puffs(scene, '#5b5b5b', 12);
  const bg = new THREE.Color(), C = (c) => new THREE.Color(c);
  const DAY = { bg: C('#d9d2c2'), sky: C('#ffffff'), sun: C('#fff1d6') }, NIGHT = { bg: C('#020202'), sky: C('#5d6f99'), sun: C('#9fb4ff') };
  scene.background = bg;

  let t = 0;
  return {
    zones, excavators, trucks, AZ,
    update(dt, { night, waiting, radio, workshop }) {
      t += dt;
      bg.lerpColors(DAY.bg, NIGHT.bg, night);
      hemi.color.lerpColors(DAY.sky, NIGHT.sky, night);
      hemi.intensity = THREE.MathUtils.lerp(2.2, 0.45, night);
      sun.color.lerpColors(DAY.sun, NIGHT.sun, night);
      sun.intensity = THREE.MathUtils.lerp(2.4, 0.35, night);
      winMat.emissiveIntensity = night * 1.3;
      lampMat.emissiveIntensity = night * 2.5;
      // STOP portal: rotators spin and pad pulses while anyone waits
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      for (const r of rotators) r.rotation.y += waiting ? dt * 7 : 0;
      beamMat.opacity = waiting ? 0.45 : 0;
      headMat.color.set(waiting ? '#ffd400' : '#6b5a00');
      padMat.color.set(waiting ? new THREE.Color('#ffd400').multiplyScalar(0.45 + 0.55 * pulse) : '#4a3d00');
      beaconMat.color.set(radio && Math.sin(t * 9) > 0 ? '#ff2a2a' : '#400');
      strobeMat.color.set(Math.sin(t * 8) > 0.4 ? '#ffb300' : '#4a3000');
      if (workshop && Math.random() < dt * 14) smoke.emit(smokeAt, 1.2, 1.4);

      // ambient site life
      for (const a of ambient) a.update(dt);
      // bucket down while driving into the pile, raised while backing out
      loader.arm.rotation.x += ((loaderDrive.fwd ? 0.5 : -0.45) - loader.arm.rotation.x) * Math.min(1, dt * 3);
      belt(t);
      if (Math.random() < dt * 25) spray.emit(sprayAt.set(0, 0.5, -1.8).applyMatrix4(wt.matrixWorld), 1.4, 0.35);
      dust.update(dt); smoke.update(dt); spray.update(dt);
    },
    dust,
  };
}
