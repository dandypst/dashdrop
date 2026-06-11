# Panduan Lengkap — Dashdrop (Firebase + Vercel + VPS)

Ikuti urut dari atas ke bawah. Total ~30–45 menit kalau lancar.

---

## 0. Gambaran besar (baca dulu, 1 menit)

Ada **3 bagian** yang saling terhubung lewat **Firebase**, bukan langsung satu sama lain:

```
   DASHBOARD                  FIREBASE                    BOT WORKER
   (di Vercel)               (Firestore)                 (di VPS)
   ─────────                 ──────────                  ──────────
   tampilkan status   ◄────  database bersama  ◄────     lapor status, saldo, log
   kirim perintah     ────►  (papan tulis)     ────►     baca perintah, eksekusi
```

Intinya:
- **Dashboard** dan **Worker** sama-sama menyambung ke **satu project Firebase yang sama**.
- Mereka **tidak** saling connect via IP/port. VPS hanya butuh koneksi keluar (outbound) ke internet.
- Kunci penghubungnya: dashboard pakai **config web Firebase**, worker pakai **service account key** — keduanya **dari project yang sama**.

Kalau satu hal saja yang harus kamu ingat: **project Firebase dashboard = project Firebase worker.** Beda project = bot tidak muncul.

---

## 1. FIREBASE

### 1.1 Buat project
1. Buka https://console.firebase.google.com → **Add project**.
2. Beri nama (mis. `airdrop-ops`) → Continue. Google Analytics boleh dimatikan → **Create project**.

### 1.2 Aktifkan Firestore (database)
1. Menu kiri **Build > Firestore Database** → **Create database**.
2. Pilih lokasi (mis. `asia-southeast2` / Jakarta) → **Next**.
3. Pilih **Start in production mode** → **Create**.
4. Setelah jadi, buka tab **Rules**, hapus isinya, tempel isi file `firestore.rules` dari proyek ini → **Publish**.

### 1.3 Aktifkan Authentication (login dashboard)
1. **Build > Authentication** → **Get started**.
2. Tab **Sign-in method** → pilih **Email/Password** → toggle **Enable** → **Save**.

### 1.4 Ambil CONFIG WEB (untuk dashboard)
1. Klik ⚙️ **Project settings** (pojok kiri atas) → tab **General**.
2. Scroll ke **Your apps** → klik ikon web **`</>`**.
3. Beri nickname (mis. `dashboard`) → **Register app**.
4. Akan muncul objek `firebaseConfig`. **Catat 6 nilai ini** (dipakai di Vercel):
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

### 1.5 Ambil SERVICE ACCOUNT KEY (untuk worker di VPS)
1. ⚙️ **Project settings** → tab **Service accounts**.
2. **Generate new private key** → **Generate key**. Sebuah file `.json` terunduh.
3. Ganti namanya jadi **`serviceAccountKey.json`**. Simpan baik-baik — ini kunci penuh ke database. **Jangan upload ke GitHub.**

> Selesai Firebase. Kamu sekarang punya: 6 nilai config web + 1 file serviceAccountKey.json.

---

## 2. DASHBOARD → VERCEL

### 2.1 Tes di komputer dulu (opsional tapi disarankan)
```bash
cd airdrop-dashboard
npm install
cp .env.local.example .env.local
```
Buka `.env.local`, isi 6 nilai dari langkah 1.4:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```
Lalu:
```bash
npm run dev
```
Buka http://localhost:3000 → harusnya muncul halaman login.

### 2.2 Push ke GitHub
File `.gitignore` sudah mengecualikan `.env.local`, `node_modules`, dan `serviceAccountKey.json`, jadi aman.
```bash
git init
git add .
git commit -m "airdrop ops"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

### 2.3 Deploy di Vercel
1. Buka https://vercel.com → daftar/masuk pakai akun GitHub.
2. **Add New… > Project** → pilih repo tadi → **Import**.
3. Vercel otomatis mendeteksi Next.js. Sebelum deploy, buka **Environment Variables** dan masukkan **6 variable yang sama** seperti `.env.local` (nama + nilai).
4. Klik **Deploy**. Tunggu sampai selesai → kamu dapat URL `https://NAMA.vercel.app`.

### 2.4 Daftarkan domain Vercel di Firebase
1. Firebase → **Authentication > Settings > Authorized domains** → **Add domain** → masukkan domain Vercel kamu (mis. `nama.vercel.app`).
   (Ini supaya login berfungsi mulus di domain produksi.)

### 2.5 Buat akun & masuk
Buka URL Vercel → halaman login → **Daftar** dengan email + password → masuk. Dashboard akan kosong dulu (belum ada bot) — itu normal.

### 2.6 (Opsional) Domain sendiri
Vercel → Project → **Settings > Domains** → Add → ikuti instruksi DNS dari registrar domain kamu.

> Selesai Vercel. Dashboard sudah online dan tersambung ke Firebase.

---

## 3. VPS + BOT WORKER

### 3.1 Pastikan jenisnya benar
- **BISA:** VPS / Cloud VPS / Cloud Server dengan **akses root + SSH** (OS Linux sendiri).
  Contoh: DigitalOcean, Vultr, Contabo, Hetzner, AWS Lightsail, Biznet Gio, IDCloudHost (produk VPS).
- **TIDAK BISA:** Shared hosting / cPanel (paket web PHP/WordPress). Tidak bisa menjalankan proses Node.js terus-menerus.

Patokan: kalau dapat **root/SSH** → aman. Kalau cuma cPanel/file manager → bukan ini yang dibutuhkan.

Rekomendasi OS: **Ubuntu 22.04 / 24.04 LTS**. Spek: 1 vCPU / 1 GB cukup untuk task HTTP. Kalau pakai puppeteer (automasi browser), ambil 2 GB+.

### 3.2 Masuk ke VPS & install Node.js
```bash
ssh root@IP_VPS

# Install Node 20 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
node -v        # pastikan keluar v20.x
```

### 3.3 Upload folder worker + kunci
Dari **komputer lokal** (bukan dari dalam VPS):
```bash
# upload folder worker
scp -r airdrop-dashboard/bot-worker root@IP_VPS:~/

# upload service account key ke dalam folder itu
scp serviceAccountKey.json root@IP_VPS:~/bot-worker/
```

### 3.4 Install dependency & amankan kunci
Kembali di VPS:
```bash
cd ~/bot-worker
npm install
chmod 600 serviceAccountKey.json     # batasi akses file kunci
```

### 3.5 Konfigurasi 2 bot dengan pm2
Install pm2:
```bash
npm install -g pm2
```
Buat file `ecosystem.config.js` di dalam `~/bot-worker` (mis. `nano ecosystem.config.js`):
```js
module.exports = {
  apps: [
    {
      name: "bot-01", script: "worker.js",
      env: {
        BOT_ID: "worker-01", BOT_NAME: "Bot 01", BOT_ACCOUNT: "akun-1",
        BOT_PLATFORM: "testnet-x",
        WALLET_ADDRESS: "0xWALLET_BOT_1", RPC_URL: "https://RPC_CHAIN", BALANCE_SYMBOL: "ETH",
        GOOGLE_APPLICATION_CREDENTIALS: "/root/bot-worker/serviceAccountKey.json",
        // PRIVATE_KEY: "0x...",   // hanya jika task kirim transaksi (wallet khusus farming!)
      },
    },
    {
      name: "bot-02", script: "worker.js",
      env: {
        BOT_ID: "worker-02", BOT_NAME: "Bot 02", BOT_ACCOUNT: "akun-2",
        BOT_PLATFORM: "testnet-x",
        WALLET_ADDRESS: "0xWALLET_BOT_2", RPC_URL: "https://RPC_CHAIN", BALANCE_SYMBOL: "ETH",
        GOOGLE_APPLICATION_CREDENTIALS: "/root/bot-worker/serviceAccountKey.json",
      },
    },
  ],
};
```
(`GOOGLE_APPLICATION_CREDENTIALS` pakai path absolut `/root/bot-worker/...` — kalau user VPS-mu bukan `root`, sesuaikan, mis. `/home/ubuntu/bot-worker/...`.)

Jalankan:
```bash
pm2 start ecosystem.config.js
pm2 logs               # lihat log, pastikan "Worker online…"
pm2 startup            # jalankan perintah yang ditampilkannya (1x saja)
pm2 save               # simpan, supaya auto-nyala setelah reboot
```

### 3.6 Amankan VPS (singkat tapi penting)
```bash
ufw allow OpenSSH
ufw enable
```
Disarankan login pakai SSH key, bukan password. Jangan pernah taруh private key wallet utama di VPS — pakai wallet khusus farming.

> Selesai VPS. Worker sudah jalan dan lapor ke Firebase.

---

## 4. MENYAMBUNGKAN & VERIFIKASI

Tidak ada langkah "connect" manual — begitu worker jalan dengan `serviceAccountKey.json` dari project yang sama, ia otomatis muncul. Cek:

1. Buka dashboard (URL Vercel) → login.
2. Dalam beberapa detik, **2 kartu** (Bot 01 & Bot 02) muncul, status **IDLE**, indikator online.
3. Klik **▶ Start** pada satu bot → status jadi **RUNNING**, dan **Live log** mulai jalan.
4. Tombol **Refresh saldo** → saldo wallet muncul (kalau `WALLET_ADDRESS` + `RPC_URL` benar).
5. Klik **■ Stop** → status kembali **STOPPED**.

### Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Bot tidak muncul sama sekali | serviceAccountKey dari project Firebase yang **beda** dari dashboard | Generate ulang key dari project yang sama (langkah 1.5) |
| Worker error saat start | Path `GOOGLE_APPLICATION_CREDENTIALS` salah | Pakai path absolut yang benar; cek `pm2 logs` |
| Kartu muncul tapi **OFFLINE** | Proses worker mati | `pm2 status`, `pm2 restart all`, cek `pm2 logs` |
| Tombol tidak berefek | Worker offline / command handler tidak ada | Pastikan online; cek nama action cocok di `commandHandlers` |
| Saldo selalu `—` | `WALLET_ADDRESS`/`RPC_URL` kosong atau RPC error | Isi keduanya; tes RPC valid untuk chain itu |
| Tidak bisa login di domain Vercel | Domain belum di-authorize | Tambah domain di Firebase Auth (langkah 2.4) |

---

## 5. ISI LOGIKA AIRDROP KAMU

Sampai sini semua jalan dengan **task placeholder**. Untuk task asli:

1. Buka `bot-worker/worker.js`, cari fungsi **`runTask()`** (loop utama) — isi dengan task berulang kamu.
2. Untuk **tombol task khusus**: tambah fungsi di `commandHandlers` (worker.js) + tambah entri di `TASK_ACTIONS` (app/page.js). Nama `action` harus sama persis.
3. Untuk transaksi on-chain:
   ```js
   const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
   await signer.sendTransaction({ to: "0x...", value: ethers.parseEther("0.001") });
   ```
4. Setelah edit worker: di VPS jalankan `git pull` (kalau pakai git) atau `scp` ulang file, lalu `pm2 restart all`.

---

## 6. CATATAN JUJUR

- Banyak proyek punya **sybil detection** dan men-disqualify automasi/multi-akun. Tool ini paling aman untuk **akun/wallet milikmu sendiri** dan untuk belajar; berisiko untuk farming massal.
- **Selalu pakai wallet & testnet terpisah** untuk eksperimen. Private key wallet utama jangan pernah masuk ke kode/VPS.
- `serviceAccountKey.json` dan `PRIVATE_KEY` adalah rahasia paling sensitif — jangan commit ke GitHub, jangan share.

---

### Ringkasan rahasia yang kamu pegang
| Item | Dipakai di | Jangan |
|---|---|---|
| 6 nilai config web Firebase | Vercel (env vars) | — (relatif aman, tapi tetap jangan sebar) |
| serviceAccountKey.json | VPS (worker) | commit ke GitHub |
| PRIVATE_KEY (jika ada) | VPS (.env/ecosystem) | pakai wallet utama; commit ke GitHub |
| Password akun dashboard | login web | bagikan |
