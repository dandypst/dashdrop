/**
 * Airdrop Bot Worker
 * ------------------
 * Jalankan di VPS yang nyala terus. Tugasnya:
 *   - daftar diri ke koleksi "bots" di Firestore
 *   - dengarkan PERINTAH dari dashboard (start, stop, + task khusus)
 *   - jalankan task airdrop kamu  <-- bagian yang KAMU isi
 *   - lapor balik: status, saldo wallet, akun, log, heartbeat
 *
 * Dashboard tidak SSH ke VPS. Ia hanya menulis "command" ke Firestore;
 * worker ini yang mengeksekusi. Aman, tanpa buka port ke internet.
 */

import "dotenv/config";
import admin from "firebase-admin";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

// ---- Identitas & konfigurasi ----
const BOT_ID = process.env.BOT_ID || "worker-01";
const BOT_NAME = process.env.BOT_NAME || BOT_ID;
const BOT_PLATFORM = process.env.BOT_PLATFORM || "unknown";
const BOT_ACCOUNT = process.env.BOT_ACCOUNT || "";       // label akun airdrop (email/handle/dll)
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "";
const RPC_URL = process.env.RPC_URL || "";
const BALANCE_SYMBOL = process.env.BALANCE_SYMBOL || "ETH";

const HEARTBEAT_MS = 15_000;
const TASK_INTERVAL_MS = 30_000;
const BALANCE_REFRESH_MS = 5 * 60_000; // refresh saldo otomatis tiap 5 menit

// ---- Init Firebase Admin ----
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
const serviceAccount = JSON.parse(readFileSync(credPath, "utf8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const botRef = db.collection("bots").doc(BOT_ID);

// ---- Provider on-chain (read-only, buat cek saldo) ----
const provider = RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null;

// ---- State ----
let running = false;
let taskTimer = null;
let stopRequested = false;

// ---- Util ----
async function log(message, level = "info") {
  console.log(`[${BOT_NAME}] ${message}`);
  try {
    await db.collection("logs").add({
      botId: BOT_ID, botName: BOT_NAME, message, level,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.error("Gagal tulis log:", e.message); }
}

async function setStatus(patch) {
  await botRef.set(
    {
      name: BOT_NAME, platform: BOT_PLATFORM, account: BOT_ACCOUNT, wallet: WALLET_ADDRESS,
      lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(), ...patch,
    },
    { merge: true }
  );
}

// ---- Cek saldo wallet & lapor ke dashboard ----
async function refreshBalance() {
  if (!provider || !WALLET_ADDRESS) {
    await log("RPC_URL / WALLET_ADDRESS belum di-set — lewati cek saldo", "warn");
    return;
  }
  try {
    const wei = await provider.getBalance(WALLET_ADDRESS);
    const bal = Number(ethers.formatEther(wei)).toFixed(4);
    await setStatus({
      balance: bal, balanceSymbol: BALANCE_SYMBOL,
      balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await log(`Saldo terbaru: ${bal} ${BALANCE_SYMBOL}`, "info");
  } catch (e) {
    await log("Gagal ambil saldo: " + e.message, "error");
  }
}

// =====================================================================
//  >>> LOGIKA AIRDROP KAMU DI SINI <<<
//
//  runTask()  = dipanggil berulang selama bot "running" (loop utama).
//  Fungsi di commandHandlers = aksi sekali-jalan dari tombol khusus.
//
//  Untuk transaksi on-chain, buat wallet dari PRIVATE_KEY (taruh di .env):
//    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
//    await signer.sendTransaction({ to, value });
//
//  CATATAN: pakai 1 wallet/akun milikmu sendiri. Banyak proyek punya
//  sybil-detection & men-disqualify automasi/multi-akun.
// =====================================================================
async function runTask() {
  // ---- placeholder demo: ganti dengan task asli ----
  await sleep(2000);
  const ok = Math.random() > 0.15;
  await log(ok ? "Task selesai ✓ (ganti runTask)" : "Task gagal — retry siklus berikutnya", ok ? "success" : "warn");
  return { ok };
  // --------------------------------------------------
}

// Contoh task khusus (dipicu tombol di dashboard). Isi sesuai airdrop.
async function dailyCheckin() {
  await log("Menjalankan daily check-in…", "info");
  await sleep(1500);
  await setStatus({ tasksCompleted: admin.firestore.FieldValue.increment(1) });
  await log("Daily check-in selesai ✓", "success");
}

async function claimFaucet() {
  await log("Klaim faucet…", "info");
  await sleep(1500);
  await setStatus({ tasksCompleted: admin.firestore.FieldValue.increment(1) });
  await log("Faucet diklaim ✓", "success");
  await refreshBalance(); // saldo berubah → segarkan
}

// ---- Loop task utama ----
async function taskLoop() {
  if (!running || stopRequested) return;
  try {
    const res = await runTask();
    const field = res.ok ? "tasksCompleted" : "tasksFailed";
    await setStatus({ status: "running", [field]: admin.firestore.FieldValue.increment(1) });
  } catch (e) {
    await log("Error tak terduga: " + e.message, "error");
    await setStatus({ status: "running", tasksFailed: admin.firestore.FieldValue.increment(1) });
  }
  if (running && !stopRequested) taskTimer = setTimeout(taskLoop, TASK_INTERVAL_MS);
}

async function startBot() {
  if (running) return;
  running = true; stopRequested = false;
  await log("Bot dimulai", "success");
  await setStatus({ status: "running" });
  taskLoop();
}

async function stopBot() {
  if (!running) return;
  stopRequested = true; running = false;
  if (taskTimer) clearTimeout(taskTimer);
  await log("Bot dihentikan", "warn");
  await setStatus({ status: "stopped" });
}

// ---- Peta perintah: tombol dashboard -> fungsi worker ----
// Tambah baris di sini + tombol di dashboard (TASK_ACTIONS) untuk task baru.
const commandHandlers = {
  start: startBot,
  stop: stopBot,
  "refresh-balance": refreshBalance,
  "daily-checkin": dailyCheckin,
  "claim-faucet": claimFaucet,
};

function listenCommands() {
  botRef.onSnapshot(async (snap) => {
    const data = snap.data();
    if (!data || !data.command) return;
    const cmd = data.command;
    await botRef.update({ command: null }); // konsumsi langsung biar tak terpicu ulang
    const handler = commandHandlers[cmd];
    if (!handler) { await log(`Perintah tak dikenal: ${cmd}`, "warn"); return; }
    try { await handler(); }
    catch (e) { await log(`Perintah "${cmd}" gagal: ${e.message}`, "error"); }
  });
}

function startHeartbeat() {
  setInterval(() => setStatus({ status: running ? "running" : "idle" }).catch(() => {}), HEARTBEAT_MS);
  setInterval(() => refreshBalance().catch(() => {}), BALANCE_REFRESH_MS);
}

async function main() {
  await setStatus({ status: "idle", command: null });
  await log("Worker online, menunggu perintah…", "info");
  await refreshBalance();
  listenCommands();
  startHeartbeat();
}

process.on("SIGINT", async () => {
  await stopBot().catch(() => {});
  await setStatus({ status: "stopped" }).catch(() => {});
  await log("Worker offline", "warn");
  process.exit(0);
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((e) => { console.error("Worker gagal start:", e); process.exit(1); });
