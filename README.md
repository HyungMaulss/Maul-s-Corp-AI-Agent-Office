# ⛏ Tambang Agent — PT Maul's Corp

Agent office bertema tambang untuk memantau sesi **Claude Code**. Penampang tambang 2D, potret di HP dan lanskap di laptop.
Satu pertanyaan yang dijawab dalam sekali lirik: **agent mana yang sedang menunggu saya?**

Tanpa dependensi npm, tanpa build, biaya Rp0. Butuh Node.js 20+.

## 1. Jalankan

```bash
cd tambang-agent
npm start
```

Buka **http://127.0.0.1:8787**, lalu tekan **▶ Demo** untuk melihat skenario 5 agent (izin, rain stop, kru subagent, idle → gym → mess).

## 2. Sambungkan Claude Code

```bash
npm run install-hooks      # pasang 13 hook HTTP ke ~/.claude/settings.json (backup otomatis)
```

Sesi Claude Code **baru** akan muncul di tambang. Untuk melepas: `npm run uninstall-hooks`.

- Hook bertipe `http` (sudah diverifikasi ada di Claude Code 2.1.112 Anda), `timeout: 2` detik. Kalau server mati, agent tetap jalan.
- Token rahasia dibuat otomatis di `data/token.txt` dan ditulis ke header `Authorization`. Event tanpa token ditolak (401).
- Server membuang `tool_input`, prompt, dan isi file di pintu masuk. Yang disimpan hanya nama tool, waktu, dan status.

## 3. Buka dari HP (Tailscale)

Server hanya mendengarkan `127.0.0.1`. Untuk HP, gunakan Tailscale (gratis, jaringan privat, bukan tunnel publik):

```bash
tailscale serve --bg 8787
```

Buka `https://<nama-laptop>.<tailnet>.ts.net` di HP (Tailscale harus aktif di HP), lalu **Tambahkan ke Layar Utama**. Aplikasi akan terbuka layar penuh (PWA).
Kalau laptop mati atau terputus, muncul banner merah **KONEKSI TERPUTUS** (layar tidak sekadar beku).

## 4. Notifikasi HP (ntfy)

1. Pasang aplikasi **ntfy** di HP, lalu subscribe ke topic acak yang panjang, misalnya `maulscorp-8f3k2-pos-stop-x91`.
2. Jalankan server dengan topic tersebut:
   - PowerShell: `$env:NTFY_TOPIC="maulscorp-8f3k2-pos-stop-x91"; npm start`
   - bash: `NTFY_TOPIC=maulscorp-8f3k2-pos-stop-x91 npm start`
3. Uji: `curl -d "tes" https://ntfy.sh/maulscorp-8f3k2-pos-stop-x91`

Isi notifikasi hanya `<nama agent> butuh izin`, tanpa perintah atau path. Topic di ntfy.sh publik bisa dibaca siapa saja yang tahu namanya, jadi pakai nama yang panjang dan acak (atau self-host lewat `NTFY_SERVER`).

## 5. Cara membaca tambang

| Status | Pemicu hook | Zona |
|---|---|---|
| ⚠ **Menunggu Anda** | `PermissionRequest`, `Notification` (permission/elicitation), `AskUserQuestion` | Pos STOP: lampu rotator, palang ditutup, banner kuning di atas layar |
| ⛏ Jalankan perintah | `PreToolUse` Bash/PowerShell | Beko di front pit |
| 🚚 Tulis / edit file | `PreToolUse` Edit/Write | Dump truck di hauling road |
| 🔍 Baca / cari | `PreToolUse` Read/Grep/Glob | Pos survei di bench 1 |
| 📡 Riset web | WebSearch/WebFetch | Menara radio |
| 💭 Merencanakan | `UserPromptSubmit`, `PostToolUse`, tool lain | Kantor, papan mine plan |
| 👥 Delegasi | tool `Agent`/`Task` | Pintu mess. Kru subagent (helm putih) keluar dengan garis putus-putus ke induknya |
| 🔧 / 🛢️ | `PostToolUseFailure` / `PreCompact` | Workshop (alat berasap / ganti oli) |
| 🌧️ Rain stop | `StopFailure` | Hujan di seluruh site, agent berteduh di kantin |
| ☕ 🏋️ 🌳 💤 | `Stop` + timer | Kantin 0–5 menit, gym/taman 5–30 menit, mess >30 menit |
| 🚌 | `SessionEnd` | Naik bus, keluar gerbang |

Sesi pertama hari itu memicu **Safety Talk Pagi**. Agent baru selalu melewati **P2H** dulu.
**Papan produksi**: ritase = jumlah tool call, tonase = token hari ini (dibaca dari transkrip lokal). Reset pukul 00:00.

Interaksi: ketuk karyawan di peta atau di daftar untuk melihat detail dan timeline 40 event terakhir. Ketuk banner kuning untuk langsung ke agent yang menunggu. Nama bisa diubah (tersimpan di `data/names.json`). Tombol 🔊 membunyikan klakson saat ada yang masuk Pos STOP; di HP juga ada getar.

## 6. Merekam konten

1. Tekan **🎬 Konten**: nama diganti samaran (Op. Ucok, Op. Asep, …), nama tool dan angka token disembunyikan, badge merah **MODE KONTEN** tampil di layar.
2. Untuk adegan yang direkayasa, tekan **▶ Demo**. Agent asli disembunyikan selama demo berjalan.
3. Layout potret di HP sudah 9:16, jadi rekam langsung tanpa crop. Tetap cek ulang setiap video sebelum diunggah.

## 7. Agent lain (n8n, script)

Kirim event netral ke endpoint yang sama:

```bash
curl -X POST http://127.0.0.1:8787/events \
  -H "Authorization: Bearer $(cat data/token.txt)" \
  -d '{"event":"tool_start","agent_id":"n8n-invoice","name":"n8n invoice","tool":"Bash"}'
```

Event: `session_start prompt tool_start tool_end tool_error needs_input turn_end subagent_start subagent_end compact api_error session_end` (`parent_id` opsional untuk kru).

## Konfigurasi

| Env | Default | |
|---|---|---|
| `PORT` | 8787 | Ubah juga saat `install-hooks` |
| `HOST` | 127.0.0.1 | Jangan ganti ke 0.0.0.0; pakai Tailscale |
| `IDLE_GYM_MIN` / `IDLE_MESS_MIN` | 5 / 30 | Ambang idle (menit) |
| `NTFY_TOPIC`, `NTFY_SERVER` | – / https://ntfy.sh | Notifikasi HP |
| `TAMBANG_TOKEN` | auto | Override token |

`npm test` menguji state machine, adapter, tonase, dan keamanan endpoint.

## Celah yang diketahui (sesuai BRD)

- `Stop` muncul setiap respons selesai, bukan setiap tugas selesai, jadi agent multi-langkah bisa sempat terlihat ngopi sebentar.
- Setelah izin disetujui, agent tetap di Pos STOP sampai tool selesai (tidak ada event "izin disetujui").
- Riwayat event hanya disimpan di memori (40 event per agent) dan hilang saat server restart. SQLite (FR-16) belum dibuat.
- Kontrol agent dari office (FR-19) sengaja tidak dibuat.
