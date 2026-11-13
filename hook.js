// Claude Code command hook: forwards event metadata to the local relay.
// Must never slow down or break the agent (NFR-04): prints nothing, always exits 0, gives up after 1.5 s (4 s online).
import { target } from './target.js';
const ts = new Date().toISOString(); // taken before reading stdin so the relay can log hook->relay latency

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
try {
  const p = JSON.parse(Buffer.concat(chunks));
  // NFR-03: only metadata leaves this process — never tool_input, prompts or file contents
  const keep = ['hook_event_name', 'session_id', 'cwd', 'tool_name', 'agent_id', 'agent_type', 'notification_type'];
  const body = Object.fromEntries(keep.filter((k) => p[k] != null).map((k) => [k, p[k]]));
  body.ts = ts;
  if (body.cwd) body.cwd = String(body.cwd).replace(/[\\/]+$/, '').split(/[\\/]/).pop(); // folder name only, never the full path
  if (p.hook_event_name === 'Notification') body.message = String(p.message || '').slice(0, 200);
  const { url, token, online } = target();
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(online ? 4000 : 1500),
  });
} catch {}
process.exit(0);
