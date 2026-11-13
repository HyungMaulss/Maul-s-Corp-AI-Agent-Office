// Claude Code command hook: forwards event metadata to the local relay.
// Must never slow down or break the agent (NFR-04): prints nothing, always exits 0, gives up after 1.5 s.
import fs from 'node:fs';
const ts = new Date().toISOString(); // taken before reading stdin so the relay can log hook->relay latency

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
try {
  const p = JSON.parse(Buffer.concat(chunks));
  // NFR-03: only metadata leaves this process — never tool_input, prompts or file contents
  const keep = ['hook_event_name', 'session_id', 'cwd', 'tool_name', 'agent_id', 'agent_type', 'notification_type'];
  const body = Object.fromEntries(keep.filter((k) => p[k] != null).map((k) => [k, p[k]]));
  body.ts = ts;
  if (p.hook_event_name === 'Notification') body.message = String(p.message || '').slice(0, 200);
  const token = fs.readFileSync(new URL('./.tambang-token', import.meta.url), 'utf8').trim();
  await fetch(`http://127.0.0.1:${process.env.TAMBANG_PORT || 8787}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1500),
  });
} catch {}
process.exit(0);
