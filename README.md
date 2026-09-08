# Maya Discord Bot 🤖🛡️🌐

Maya adalah bot Discord modular yang dibangun menggunakan **TypeScript**, **discord.js v14**, **Prisma ORM (PostgreSQL)**, dan **AI Integration**. Bot ini siap dideploy ke server VPS menggunakan **Docker** dan dikelola via **Web Dashboard**.

---

## 🌟 Fitur Utama
1. **🛡️ Moderasi & Automod (Pencegahan Kata Kasar)**:
   - Command moderasi: `/warn`, `/kick`, `/ban`, `/clear`.
   - Konfigurasi server & channel sapaan dikelola dengan aman via **Web Dashboard**.
   - Sistem Automod: Deteksi otomatis kata-kata kasar dengan penambahan strike warning ke database PostgreSQL. User yang mencapai 3 strike akan otomatis di-timeout selama 10 menit.
2. **🌐 Web Dashboard Terpusat**:
   - Seluruh pengaturan server (Welcome Embed, Automod, Strike Logs, Announce, Rules, Mabar Scheduler, Maya Poll, Story Chain, Reaction Roles, Economy RTK, dll.) dikelola terpusat dari dashboard web.
3. **🔮 Integrasi AI & Komunitas**:
   - Voice AI Chat, Tebak-Tebakan, Menfess, Pantun, dan fitur komunitas interaktif lainnya.

---

## 🛠️ Persiapan Sebelum Deploy

### 1. Buat Bot di Discord Developer Portal
1. Buka [Discord Developer Portal](https://discord.com/developers/applications).
2. Klik **New Application**, beri nama bot Anda, lalu buat.
3. Masuk ke tab **Bot**:
   - Reset Token dan simpan token tersebut (ini akan menjadi `DISCORD_TOKEN`).
   - Di bagian **Privileged Gateway Intents**, aktifkan:
     - **Presence Intent**
     - **Server Members Intent** (Penting untuk menyapa member baru)
     - **Message Content Intent** (Penting untuk deteksi automod)
4. Masuk ke tab **OAuth2** -> **URL Generator**:
   - Pilih scope: `bot` dan `applications.commands`.
   - Pilih permissions: `Administrator` (atau centang hak moderasi, kirim pesan, embed links, hubungkan voice, berbicara).
   - Salin link yang digenerate di bagian bawah dan gunakan link tersebut untuk mengundang (invite) bot ke server Anda.

### 2. Dapatkan API Key Gemini AI
1. Buka [Google AI Studio](https://aistudio.google.com/).
2. Buat API Key baru dan simpan (ini akan menjadi `GEMINI_API_KEY`).

---

## 🚀 Cara Menjalankan Bot

### Opsi A: Deployment Cepat menggunakan Docker (Sangat Direkomendasikan)
Docker akan otomatis menginstal dependensi (termasuk `ffmpeg` untuk musik), mem-compile TypeScript, dan menjalankan bot. Anda perlu menghubungkan bot ke database PostgreSQL eksternal Anda.

1. Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Isi nilai `DISCORD_TOKEN`, `CLIENT_ID`, `GEMINI_API_KEY`, dan `DATABASE_URL` (URL database PostgreSQL eksternal Anda) di file `.env`.

3. Jalankan Docker Compose:
   ```bash
   docker-compose up -d --build
   ```

4. Selesai! Bot akan aktif dan terhubung ke database PostgreSQL Anda secara otomatis.

---

### Opsi B: Menjalankan Secara Lokal (Tanpa Docker)
Anda membutuhkan **Node.js v20+**, **FFmpeg** terinstal di OS Anda, dan database **PostgreSQL** yang berjalan secara lokal.

1. Instal dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` menjadi `.env` dan sesuaikan nilainya:
   - Pastikan `DATABASE_URL` mengarah ke database PostgreSQL lokal Anda (misal: `postgresql://postgres:password@localhost:5432/maya_db?schema=public`).
3. Jalankan sinkronisasi skema Prisma ke database:
   ```bash
   npx prisma db push
   ```
4. Jalankan bot dalam mode development:
   ```bash
   npm run dev
   ```
5. Untuk kompilasi production:
   ```bash
   npm run build
   npm start
   ```

---

## ⚙️ Cara Menguji Bot di Discord
1. Undang bot ke server Anda menggunakan tautan OAuth2 yang dibuat di langkah persiapan.
2. Buka Web Dashboard untuk mengonfigurasi channel welcome, automod, dan fitur lainnya secara aman.
3. Coba ketik kata kasar (misal: `anjing` atau `goblok`) untuk menguji Automod. Bot akan menghapus pesan Anda dan mencatat strike.
4. Masuk ke Voice Channel lalu panggil Maya dengan `/voice join` atau berbicara langsung untuk mengobrol santai bersama Maya.

---

## 📁 Struktur Proyek Modular
```
src/
 ├── bot.ts                # Entry point utama bot
 ├── types.ts              # Definisi type TypeScript
 ├── commands/             
 │    ├── moderation/      # /kick, /ban, /clear, /warn
 │    ├── music/           # /play, /skip, /queue, /stop
 │    └── ai/              # /ask (Gemini AI)
 ├── events/               # ready, interactionCreate, guildMemberAdd, messageCreate (automod)
 ├── services/
 │    ├── database.ts      # Prisma client & database connection
 │    ├── aiClient.ts      # Integrasi Google Gemini API
 │    └── musicManager.ts  # Voice player & queue manager
 └── utils/
      ├── logger.ts        # Helper log konsol terstruktur
      └── embeds.ts        # Desain layout Discord Embed
```
