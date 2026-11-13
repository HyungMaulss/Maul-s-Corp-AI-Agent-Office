# Tambang Agent — Maul's Corp

Diorama tambang 3D untuk memantau sesi Claude Code: siapa yang bekerja, siapa yang **menunggu Anda**, siapa yang menganggur.
Hanya jalan lokal (`127.0.0.1`), desktop browser.

## Jalankan

```sh
npm install
npm start            # relay + tampilan di http://127.0.0.1:8787
npm run hooks        # pasang hook ke ~/.claude/settings.json (backup: settings.json.bak-tambang)
npm run hooks:remove # lepas hook
npm run demo         # simulator 8 agent palsu, aman untuk rekaman (relay harus jalan)
npm test
```

Sesi Claude Code baru otomatis muncul di peta. Kalau relay mati, hook gagal diam-diam dan tidak memperlambat agent.

Ambang idle bisa diubah lewat URL: `http://127.0.0.1:8787/?idle1=5&idle2=30` (menit ke gym/taman, ke mess).

## Kirim event dari agent lain (n8n, script)

Token ada di file `.tambang-token` (dibuat otomatis saat `npm start` pertama). Jangan dibagikan.

```sh
curl -X POST http://127.0.0.1:8787/events \
  -H "Authorization: Bearer $(cat .tambang-token)" \
  -H "content-type: application/json" \
  -d '{"v":1,"agent_id":"n8n-1","name":"n8n invoice","event":"tool_start","tool":"Bash"}'
```

`event`: `session_start`, `prompt`, `tool_start`, `tool_end`, `tool_error`, `needs_input`, `turn_end`,
`subagent_start`, `subagent_end`, `compact`, `api_error`, `session_end`.
Opsional: `parent_id` (jadikan kru dari agent lain), `ts` (ISO 8601).
`tool` menentukan alat: `Bash` → ekskavator, `Edit`/`Write` → dump truck, `Read`/`Grep`/`Glob` → pos survei, `WebSearch`/`WebFetch` → menara radio.

## Privasi

Hook hanya mengirim metadata (nama event, nama tool, folder project, id sesi). Isi perintah, prompt, dan isi file tidak pernah dikirim.
Untuk rekaman: aktifkan **Mode konten** (nama samaran, tool disembunyikan), atau pakai `npm run demo`.
