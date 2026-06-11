# Dashdrop — Bot Console

Dashboard monitoring + kontrol untuk bot otomasi airdrop/testnet.
Stack: **Next.js** (deploy ke Vercel) · **Firestore** (database) · **bot worker** Node.js (jalan di host sendiri).

## Cara kerja (penting!)

```
┌──────────────┐     command      ┌──────────────┐    perintah    ┌──────────────┐
│  Dashboard   │ ───────────────► │   Firestore  │ ◄───────────── │  Bot Worker  │
│  (Vercel)    │ ◄─────────────── │  (database)  │ ──────────────►│ (PC/VPS/dll) │
└──────────────┘  status & log    └──────────────┘  status & log  └──────────────┘
```

Vercel **tidak** menjalankan bot (serverless, tidak bisa proses nyala terus).
Bot asli jalan di **bot-worker** yang kamu host sendiri. Firestore jadi penghubung.

---

## 1. Setup Firebase

1. Buat project di https://console.firebase.google.com
2. **Build > Firestore Database** → Create database (mode production).
3. Tab **Rules** → tempel isi `firestore.rules` → Publish.
4. **Build > Authentication** → Get started → aktifkan **Email/Password**.
5. **Project Settings (⚙️) > General** → scroll ke "Your apps" → klik web (`</>`) → daftarkan app → salin nilai `firebaseConfig`.

## 2. Setup & deploy dashboard ke Vercel

```bash
cd airdrop-dashboard
npm install
cp .env.local.example .env.local   # lalu isi dari firebaseConfig tadi
npm run dev                        # tes lokal di http://localhost:3000
```

Deploy:
1. Push folder ini ke repo GitHub.
2. Buka https://vercel.com → New Project → import repo-nya.
3. Di **Environment Variables**, masukkan semua `NEXT_PUBLIC_FIREBASE_*` (sama seperti `.env.local`).
4. Deploy. Domain otomatis dikasih `*.vercel.app`, atau pasang domain sendiri di Settings > Domains.

Buka domainnya → daftar akun di halaman login → masuk ke console.

## 3. Setup & jalankan bot worker

Worker butuh **service account** (bukan config web):
1. Firebase **Project Settings > Service accounts** → Generate new private key → simpan sebagai `bot-worker/serviceAccountKey.json`.

```bash
cd bot-worker
npm install
cp .env.example .env     # isi BOT_ID, BOT_NAME, BOT_PLATFORM, FIREBASE_PROJECT_ID
npm start
```

Worker akan muncul otomatis di dashboard. Klik **Start** → worker mulai jalan.
Mau banyak bot? Jalankan worker lagi dengan `BOT_ID` berbeda (tiap instance = 1 kartu di dashboard).

## 4. Isi logika airdrop kamu

Buka `bot-worker/worker.js`, cari fungsi **`runTask()`** (ada penanda besar).
Di situ kamu taruh task asli, misalnya:
- kirim transaksi testnet (ethers.js / viem / web3.js)
- daily check-in / claim faucet via HTTP request
- swap kecil di DEX testnet
- automasi web via puppeteer/playwright

`runTask()` cukup return `{ ok: true }` (sukses) atau `{ ok: false }` (gagal) — sisanya (hitung statistik, log, heartbeat) sudah ditangani.

---

## Catatan jujur soal airdrop farming

- Hampir semua proyek punya **sybil detection** dan melarang otomasi/multi-akun. Farming massal sering di-**disqualify** saat distribusi token.
- Tool ini paling aman & berguna untuk **1 akun/wallet milikmu sendiri** dan untuk belajar.
- **Selalu pakai testnet/wallet terpisah** untuk eksperimen. Jangan taruh seed phrase / private key wallet utama di kode bot.
- Banyak "airdrop bot" gratisan di internet justru malware pencuri wallet — karena ini kamu bangun sendiri, kamu tahu persis isinya. Pertahankan itu: jangan tempel kode dari sumber tak jelas ke `runTask()`.

## Struktur file

```
airdrop-dashboard/
├── app/
│   ├── page.js           # dashboard utama (monitoring + start/stop)
│   ├── login/page.js     # login & daftar
│   ├── layout.js
│   └── globals.css
├── lib/firebase.js       # init Firebase (client)
├── firestore.rules       # security rules
├── .env.local.example    # config Firebase untuk dashboard
└── bot-worker/
    ├── worker.js         # <-- isi runTask() di sini
    ├── .env.example
    └── package.json
```
