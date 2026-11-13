// Where hook.js and demo.js send events: the online relay if .tambang-remote.json exists, else the local one.
import fs from 'node:fs';

export function target() {
  const remote = new URL('./.tambang-remote.json', import.meta.url);
  if (fs.existsSync(remote)) {
    const { url, token } = JSON.parse(fs.readFileSync(remote, 'utf8'));
    return { url: `${String(url).replace(/\/+$/, '')}/events`, token, online: true };
  }
  const token = fs.readFileSync(new URL('./.tambang-token', import.meta.url), 'utf8').trim();
  return { url: `http://127.0.0.1:${process.env.TAMBANG_PORT || 8787}/events`, token, online: false };
}
