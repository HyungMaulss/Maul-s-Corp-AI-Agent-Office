// FR-13 event simulator: fake Claude Code hook payloads through the real relay. Safe for recording (no real projects).
import { target } from './target.js';

const { url: URL_, token } = target();
const send = async (p) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(p) });
  if (!r.ok) throw new Error(`relay menolak event (${r.status})`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const agent = (n, folder) => (ev, extra = {}) => send({ hook_event_name: ev, session_id: `demo-${n}`, cwd: `C:/proyek/${folder}`, ...extra });
const tool = (fn, name, extra) => fn('PreToolUse', { tool_name: name, ...extra });

const api = agent(1, 'api-refactor'), web = agent(2, 'landing-page'), data = agent(3, 'data-pipeline'), docs = agent(4, 'docs-bot');
const infra = agent(5, 'infra-audit'), legacy = agent(6, 'legacy-app'), sync = agent(7, 'mobile-sync'), bill = agent(8, 'billing');
const crew = { agent_id: 'crew-1', agent_type: 'Explore' };

try {
  for (const a of [api, web, data, docs, infra, legacy, sync, bill]) { await a('SessionStart'); await sleep(150); }
  // idle agents at different ages: canteen / gym-park / mess
  for (const [a, min] of [[legacy, 45], [sync, 12], [bill, 1]]) { await a('UserPromptSubmit'); await a('Stop', { ts: ago(min) }); }
  await api('UserPromptSubmit'); await tool(api, 'Bash');
  await web('UserPromptSubmit'); await tool(web, 'Edit');
  await data('UserPromptSubmit'); await tool(data, 'Grep');
  await docs('UserPromptSubmit'); await tool(docs, 'WebSearch');
  await infra('UserPromptSubmit'); await infra('PermissionRequest', { tool_name: 'Bash' });
  console.log('Demo berjalan. Ctrl+C untuk berhenti.');

  for (let step = 0; ; step++) {
    await sleep(4000);
    const s = step % 12;
    await web('PostToolUse'); await tool(web, s % 2 ? 'Write' : 'Edit');
    await data('PostToolUse'); await tool(data, ['Read', 'Glob', 'Grep'][s % 3]);
    if (s === 1) { await api('PostToolUse'); await tool(api, 'Agent'); await api('SubagentStart', crew); await tool(api, 'Read', crew); }
    if (s === 3) await docs('StopFailure');                                 // rain stop
    if (s === 4) await data('PostToolUseFailure');                          // workshop
    if (s === 5) { await infra('PostToolUse'); await tool(infra, 'Bash'); } // permission granted
    if (s === 6) { await docs('UserPromptSubmit'); await tool(docs, 'WebFetch'); }
    if (s === 7) { await api('SubagentStop', crew); await api('PostToolUse'); await tool(api, 'Bash'); }
    if (s === 8) await web('PreCompact');
    if (s === 9) await infra('PermissionRequest', { tool_name: 'Bash' });    // waiting again
    if (s === 10) await bill('SessionEnd');                                  // goes home by bus
    if (s === 11) { await bill('SessionStart'); await bill('UserPromptSubmit'); await bill('Stop'); }
  }
} catch (e) {
  console.error(`Demo gagal: ${e.cause?.code === 'ECONNREFUSED' ? 'relay belum jalan — jalankan "npm start" dulu' : e.message}`);
  process.exit(1);
}
