import assert from 'node:assert/strict';
import { toNeutral, applyEvent } from './relay.js';

const T = Date.parse('2026-11-12T09:00:00Z');
const hook = (name, extra = {}) => toNeutral({ hook_event_name: name, session_id: 's1', cwd: 'C:\\proyek\\api-refactor', ...extra }, T);

// adapter
assert.equal(hook('PreToolUse', { tool_name: 'Bash' }).event, 'tool_start');
assert.equal(hook('PreToolUse').name, 'api-refactor');
assert.equal(hook('Notification', { notification_type: 'idle_prompt' }), null);
assert.equal(hook('Notification', { message: 'Claude is waiting for your input' }), null);
assert.equal(hook('Notification', { notification_type: 'auth_success' }), null);
assert.equal(hook('Notification', { notification_type: 'permission_prompt' }).event, 'needs_input');
assert.equal(hook('Notification', { message: 'Claude needs your permission to use Bash' }).event, 'needs_input');
assert.equal(hook('PermissionRequest').event, 'needs_input');
assert.equal(hook('NoSuchEvent'), null);
const sub = hook('SubagentStart', { agent_id: 'a9', agent_type: 'Explore' });
assert.deepEqual([sub.id, sub.parent, sub.name], ['s1:a9', 's1', 'Explore']);
assert.equal(toNeutral({ event: 'tool_start', agent_id: 'n8n-1', tool: 'Write' }, T).id, 'n8n-1');
assert.equal(toNeutral({ event: 'bogus', agent_id: 'x' }, T), null);
assert.equal(toNeutral({ event: 'prompt', agent_id: 'x', ts: '2099-01-01' }, T).ts, T, 'future ts clamps to now');
assert.equal(toNeutral({ hook_event_name: 'Stop', tool_input: { command: 'rm -rf' }, session_id: 's' }, T).tool_input, undefined);

// state machine
const agents = new Map();
const run = (name, extra) => applyEvent(agents, hook(name, extra));
assert.equal(run('PreToolUse', { tool_name: 'Edit' }).state, 'edit');
assert.equal(run('PermissionRequest').state, 'waiting');
assert.equal(run('PostToolUse').state, 'think');
assert.equal(agents.get('s1').ritase, 1);
assert.equal(run('PreToolUse', { tool_name: 'mcp__foo__bar' }).state, 'think');
assert.equal(run('StopFailure').state, 'rain');
assert.equal(run('Stop').state, 'idle');
run('SubagentStart', { agent_id: 'a9' });
assert.equal(run('SessionEnd').state, 'leaving');
assert.equal(agents.get('s1:a9').state, 'leaving', 'subagents leave with their parent');
assert.equal(applyEvent(new Map(), hook('SessionEnd')), null, 'unknown session ending is ignored');

console.log('ok');
