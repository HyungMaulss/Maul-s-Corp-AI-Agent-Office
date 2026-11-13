// Adds (or with --remove, removes) the Tambang Agent hook in ~/.claude/settings.json. Backs the file up first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'PreCompact', 'StopFailure'];
const hookPath = fileURLToPath(new URL('./hook.js', import.meta.url)).replaceAll('\\', '/');
const command = `node "${hookPath}"`;
const file = path.join(os.homedir(), '.claude', 'settings.json');
const remove = process.argv.includes('--remove');

const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-tambang`);
settings.hooks ??= {};
for (const ev of EVENTS) {
  const groups = (settings.hooks[ev] ?? [])
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !String(h.command ?? '').includes('tambang-agent/hook.js')) }))
    .filter((g) => g.hooks.length);
  // async: runs in the background so the visualizer can never slow the agent down (NFR-04)
  if (!remove) groups.push({ hooks: [{ type: 'command', command, async: true, timeout: 5 }] });
  if (groups.length) settings.hooks[ev] = groups; else delete settings.hooks[ev];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log(`${remove ? 'Hook dihapus dari' : 'Hook dipasang di'} ${file} (backup: settings.json.bak-tambang)`);
if (!remove) console.log('Mulai sesi Claude Code baru supaya hook terbaca.');
