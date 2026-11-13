# Tambang Agent — Maul's Corp

Diorama tambang 3D untuk memantau sesi Claude Code: siapa yang bekerja, siapa yang **menunggu Anda**, siapa yang menganggur.
Bisa jalan lokal (`127.0.0.1`) atau online gratis di Cloudflare (lihat [Jalankan online](#jalankan-online-cloudflare-gratis)). Desktop browser.

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

Kontrol: scroll = zoom, seret = geser, klik pekerja = fokus, klik 2× / Esc = reset.

## Jalankan online (Cloudflare, gratis)

Tanpa `npm start` di laptop: halaman 3D dan relay jalan di Cloudflare Workers (free tier, Rp0) dan bisa dibuka dari mana saja.
Claude Code tetap berjalan di laptop Anda; hook-nya mengirim event ke URL online.

1. Buat akun gratis di <https://dash.cloudflare.com>, lalu login sekali:
   ```sh
   npm install
   npx wrangler@4 login
   ```
2. Buat dua kunci rahasia (jalankan 2×, simpan hasilnya): **kunci 1** untuk hook, **kunci 2** untuk membuka halaman.
   ```sh
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
3. Deploy, lalu pasang kedua kunci:
   ```sh
   npm run deploy
   npx wrangler@4 secret put TAMBANG_TOKEN   # tempel kunci 1
   npx wrangler@4 secret put VIEW_KEY        # tempel kunci 2
   ```
   URL tampil di output deploy, misalnya `https://tambang-agent.<akun>.workers.dev`.
4. Arahkan hook ke sana dengan membuat file `.tambang-remote.json` di folder ini (file ini tidak ikut ke git):
   ```json
   { "url": "https://tambang-agent.<akun>.workers.dev", "token": "<kunci 1>" }
   ```
   Hook tetap perlu dipasang sekali dengan `npm run hooks`. Hapus file ini untuk kembali ke relay lokal. `npm run demo` juga ikut ke URL online.
5. Buka `https://tambang-agent.<akun>.workers.dev/?key=<kunci 2>`. Key disimpan di browser lalu dihapus dari address bar.

Uji versi online di laptop dulu: buat `.dev.vars` berisi `TAMBANG_TOKEN=...` dan `VIEW_KEY=...`, lalu `npm run online:dev` (port 8790).

Catatan:
- Yang keluar dari laptop hanya nama folder project, nama tool, id sesi, dan waktu. Perintah, prompt, isi file, dan path lengkap tidak pernah dikirim.
- Siapa pun yang tahu kunci 2 bisa melihat dashboard. Untuk mengganti kunci, ulangi `secret put`.
- Kuota gratis Workers 100.000 request/hari; 1 event hook = 1 request. Pemakaian normal jauh di bawahnya.

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
