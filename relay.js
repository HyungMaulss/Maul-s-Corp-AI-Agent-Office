// Adapter (raw payload -> neutral event) + per-agent state machine. The only place that knows what events mean.

const HOOK_EVENT = {
  SessionStart: 'session_start', SessionEnd: 'session_end', UserPromptSubmit: 'prompt',
  PreToolUse: 'tool_start', PostToolUse: 'tool_end', PostToolUseFailure: 'tool_error',
  PermissionRequest: 'needs_input', Notification: 'needs_input', Stop: 'turn_end',
  SubagentStart: 'subagent_start', SubagentStop: 'subagent_end', PreCompact: 'compact', StopFailure: 'api_error',
};
const NEUTRAL = new Set(Object.values(HOOK_EVENT));
const NEEDS_USER = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

const TOOL_STATE = {
  Bash: 'bash', PowerShell: 'bash',
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Read: 'read', Grep: 'read', Glob: 'read', LS: 'read',
  WebSearch: 'web', WebFetch: 'web',
  Task: 'delegate', Agent: 'delegate',
};

const str = (v, max) => (v == null || v === '' ? null : String(v).slice(0, max));
const base = (p) => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'agent';
export const dayKey = (ts) => new Date(ts).toDateString();

/** Raw Claude Code hook payload or neutral v1 event -> neutral event, or null to ignore. Only metadata survives. */
export function toNeutral(p, now = Date.now()) {
  if (!p || typeof p !== 'object') return null;
  const t = Date.parse(p.ts);
  const ts = Number.isFinite(t) && t <= now + 5000 ? Math.min(t, now) : now;
  let e;
  if (p.hook_event_name) {
    const event = HOOK_EVENT[p.hook_event_name];
    if (!event || !p.session_id) return null;
    // Only notifications that block on the user count; idle_prompt, auth_success, quota_* etc. are not "waiting"
    if (p.hook_event_name === 'Notification' &&
      !(p.notification_type ? NEEDS_USER.has(p.notification_type) : /permission/i.test(p.message || ''))) return null;
    const sid = String(p.session_id);
    const sub = p.agent_id ? String(p.agent_id) : null;
    e = {
      id: sub ? `${sid}:${sub}` : sid,
      parent: sub ? sid : null,
      name: sub ? (p.agent_type || 'kru') : p.cwd ? base(p.cwd) : 'agent',
      event, tool: p.tool_name,
    };
  } else {
    if (!NEUTRAL.has(p.event) || !p.agent_id) return null;
    e = { id: String(p.agent_id), parent: p.parent_id, name: p.name || p.agent_id, event: p.event, tool: p.tool };
  }
  return { id: e.id.slice(0, 120), parent: str(e.parent, 120), name: str(e.name, 40), event: e.event, tool: str(e.tool, 60), ts };
}

/** Applies a neutral event to the agents Map. Returns the touched agent (or null). */
export function applyEvent(agents, e) {
  let a = agents.get(e.id);
  if (!a) {
    if (e.event === 'session_end' || e.event === 'subagent_end') return null;
    a = { id: e.id, parent: e.parent, name: e.name, state: 'idle', since: e.ts, tool: null, ritase: 0, day: dayKey(e.ts) };
    agents.set(e.id, a);
  }
  if (a.day !== dayKey(e.ts)) { a.ritase = 0; a.day = dayKey(e.ts); } // papan produksi reset tiap tengah malam
  const set = (s) => { if (a.state !== s) { a.state = s; a.since = e.ts; } };
  switch (e.event) {
    case 'session_start': set('idle'); break;
    case 'prompt': set('think'); break;
    case 'tool_start': a.tool = e.tool; set(TOOL_STATE[e.tool] || 'think'); break;
    case 'tool_end': a.ritase++; set('think'); break;
    case 'tool_error': a.ritase++; set('error'); break;
    case 'needs_input': set('waiting'); break;
    case 'turn_end': set('idle'); break;
    case 'subagent_start': set('think'); break;
    case 'compact': set('compact'); break;
    case 'api_error': set('rain'); break;
    case 'subagent_end':
    case 'session_end':
      set('leaving');
      for (const c of agents.values()) if (c.parent === a.id) { c.state = 'leaving'; c.since = e.ts; }
      break;
  }
  return a;
}
