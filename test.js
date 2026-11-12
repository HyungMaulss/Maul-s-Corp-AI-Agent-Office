// npm test — state machine, adapter, dan keamanan endpoint.
import assert from 'node:assert/strict';
import { applyEvent, tick, agents, world, fromClaude, fromGeneric, toolZone, idleZone, authOk, createServer, todayTokens } from './server.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const T0 = new Date('2026-11-12T08:00:00').getTime(), MIN = 60e3;
const cc = (hook, extra = {}) => fromClaude({ hook_event_name: hook, session_id: 'S1', cwd: 'C:\\proj\\api-refactor', transcript_path: 'x', ...extra });
const st = id => agents.get(id)?.state;

// adapter: tool_input dibuang, nama = folder, idle_prompt bukan "menunggu"
const ev = cc('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf secret' } });
assert.equal(ev.event, 'tool_start'); assert.equal(ev.name, 'api-refactor'); assert.ok(!JSON.stringify(ev).includes('secret'));
assert.equal(cc('Notification', { notification_type: 'idle_prompt' }), null);
assert.equal(cc('Notification', { notification_type: 'permission_prompt' }).event, 'needs_input');
assert.equal(cc('PreToolUse', { tool_name: 'AskUserQuestion' }).event, 'needs_input');
assert.equal(fromClaude({ hook_event_name: 'Stop' }), null); // tanpa session_id
assert.deepEqual([toolZone('Edit'), toolZone('Grep'), toolZone('WebFetch'), toolZone('Agent'), toolZone('TodoWrite')], ['edit', 'read', 'web', 'delegate', 'think']);
assert.equal(fromGeneric({ event: 'hack', agent_id: 'x' }), null);
assert.equal(fromGeneric({ event: 'prompt', agent_id: 'n8n-1', name: 'n8n' }).name, 'n8n');

// alur satu sesi
world.apelDay = null;
applyEvent(cc('SessionStart'), T0);
assert.equal(st('S1'), 'p2h'); assert.ok(world.apelUntil > T0, 'safety talk pertama hari ini');
const apel = world.apelUntil; applyEvent({ ...cc('SessionStart'), agent_id: 'S9' }, T0 + 1000); assert.equal(world.apelUntil, apel, 'apel hanya sekali sehari');
agents.delete('S9');
tick(T0 + 5000); assert.equal(st('S1'), 'kantin');
applyEvent(cc('UserPromptSubmit'), T0 + 6000); assert.equal(st('S1'), 'think');
applyEvent(cc('PreToolUse', { tool_name: 'Bash' }), T0 + 7000); assert.equal(st('S1'), 'bash');
let waited = 0; world.onWaiting = () => waited++;
applyEvent(cc('PermissionRequest', { tool_name: 'Bash' }), T0 + 8000); assert.equal(st('S1'), 'waiting');
applyEvent(cc('Notification', { notification_type: 'permission_prompt' }), T0 + 8500); assert.equal(waited, 1, 'notif HP sekali per masuk Pos STOP');
applyEvent(cc('PostToolUse', { tool_name: 'Bash' }), T0 + 9000); assert.equal(st('S1'), 'think'); assert.equal(agents.get('S1').ritase, 1);
applyEvent(cc('PostToolUseFailure', { tool_name: 'Edit' }), T0 + 9500); assert.equal(st('S1'), 'error');
tick(T0 + 14000); assert.equal(st('S1'), 'think');
applyEvent(cc('Stop'), T0 + 15000); assert.equal(st('S1'), 'kantin');
tick(T0 + 15000 + 6 * MIN); assert.ok(['gym', 'taman'].includes(st('S1')));
tick(T0 + 15000 + 31 * MIN); assert.equal(st('S1'), 'mess');
applyEvent(cc('UserPromptSubmit'), T0 + 40 * MIN); assert.equal(st('S1'), 'think', 'bangun dari mess');
applyEvent(cc('StopFailure'), T0 + 41 * MIN); assert.equal(st('S1'), 'rain');

// subagent: event dengan agent_id masuk ke kru, bukan induk
applyEvent(cc('SubagentStart', { agent_id: 'A1', agent_type: 'Explore' }), T0 + 42 * MIN);
const kid = agents.get('S1:A1'); assert.equal(kid.parent, 'S1'); assert.equal(kid.name, 'Explore');
applyEvent(cc('PreToolUse', { agent_id: 'A1', agent_type: 'Explore', tool_name: 'Grep' }), T0 + 42 * MIN + 1);
assert.equal(st('S1:A1'), 'read'); assert.equal(st('S1'), 'rain');
applyEvent(cc('SessionEnd'), T0 + 43 * MIN); assert.equal(st('S1'), 'leaving'); assert.equal(st('S1:A1'), 'leaving');
tick(T0 + 43 * MIN + 7000); assert.equal(agents.size, 0);

// nama ganda, reset tengah malam
applyEvent({ ...cc('SessionStart'), agent_id: 'S2' }, T0); applyEvent({ ...cc('SessionStart'), agent_id: 'S3' }, T0);
assert.equal(agents.get('S3').name, 'api-refactor #2');
agents.get('S2').ritase = 9; tick(T0 + 24 * 60 * MIN); assert.equal(agents.get('S2').ritase, 0);
assert.equal(idleZone({ id: 'x', sim: true, idleSince: 0 }, 50e3), 'mess', 'demo memakai waktu yang dipercepat');
agents.clear();

// tonase: dedupe per message.id, hanya hari ini
const tmp = path.join(os.tmpdir(), `tambang-${process.pid}.jsonl`);
const u = (id, ts, o) => JSON.stringify({ timestamp: ts, message: { id, usage: { input_tokens: 10, output_tokens: o } } });
fs.writeFileSync(tmp, [u('m1', '2026-11-11T10:00:00', 999), u('m2', '2026-11-12T09:00:00', 5), u('m2', '2026-11-12T09:00:00', 5), u('m3', '2026-11-12T09:01:00', 20), 'rusak{'].join('\n'));
assert.equal(await todayTokens(tmp, T0 + 2 * 60 * MIN), 45);
fs.unlinkSync(tmp);

// keamanan HTTP: tanpa token ditolak, aksi browser butuh header kustom
assert.equal(authOk('Bearer abc', 'abc'), true); assert.equal(authOk('Bearer abd', 'abc'), false); assert.equal(authOk(undefined, 'abc'), false);
const srv = createServer('tok123').listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const body = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'H1', cwd: '/x/web' });
assert.equal((await fetch(`${base}/events`, { method: 'POST', body })).status, 401);
const ok = await fetch(`${base}/events`, { method: 'POST', body, headers: { Authorization: 'Bearer tok123' } });
assert.equal(ok.status, 200); assert.equal(await ok.text(), '', 'respons kosong: hook tidak ikut memutuskan izin');
assert.equal(agents.get('H1').name, 'web');
assert.equal((await fetch(`${base}/sim`, { method: 'POST', body: '{"on":true}' })).status, 403);
assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 404);
assert.equal((await fetch(`${base}/`)).status, 200);
srv.close();
console.log('✔ semua tes lulus');
