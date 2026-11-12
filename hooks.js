// npm run install-hooks / uninstall-hooks — pasang hook HTTP Claude Code ke ~/.claude/settings.json (dengan backup).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadToken } from './server.js';

const PORT = +process.env.PORT || 8787;
const URL_ = `http://127.0.0.1:${PORT}/events`;
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact'];
const file = path.join(os.homedir(), '.claude', 'settings.json');
const mode = process.argv[2];
if (!['install', 'uninstall'].includes(mode)) { console.log('pakai: node hooks.js install|uninstall'); process.exit(1); }

const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-tambang-${Date.now()}`);
settings.hooks ||= {};

const ours = h => h.type === 'http' && String(h.url).endsWith(`:${PORT}/events`);
for (const ev of Object.keys(settings.hooks)) { // buang entri lama kita dulu -> idempoten
  settings.hooks[ev] = settings.hooks[ev].map(g => ({ ...g, hooks: g.hooks.filter(h => !ours(h)) })).filter(g => g.hooks.length);
  if (!settings.hooks[ev].length) delete settings.hooks[ev];
}
if (mode === 'install') {
  const token = loadToken();
  // timeout kecil (NFR-04): visualizer mati tidak boleh menahan agent
  for (const ev of EVENTS) (settings.hooks[ev] ||= []).push({ hooks: [{ type: 'http', url: URL_, headers: { Authorization: `Bearer ${token}` }, timeout: 2 }] });
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2));
console.log(mode === 'install'
  ? `✔ ${EVENTS.length} hook terpasang di ${file}\n  Sesi Claude Code BARU akan muncul di tambang. Backup: ${file}.bak-tambang-*`
  : `✔ Hook Tambang Agent dilepas dari ${file}`);
