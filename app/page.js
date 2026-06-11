"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const STALE_MS = 60_000; // worker dianggap offline kalau heartbeat > 60 dtk

// ─────────────────────────────────────────────────────────────
//  TOMBOL TASK KHUSUS — tambah/edit sesuai airdrop kamu.
//  "action" harus cocok dengan commandHandlers di bot-worker/worker.js
// ─────────────────────────────────────────────────────────────
const TASK_ACTIONS = [
  { action: "daily-checkin", label: "Daily check-in" },
  { action: "claim-faucet", label: "Claim faucet" },
  { action: "refresh-balance", label: "Refresh saldo" },
];

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [bots, setBots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const unsubBots = onSnapshot(
      query(collection(db, "bots"), orderBy("name")),
      (snap) => setBots(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLogs = onSnapshot(
      query(collection(db, "logs"), orderBy("ts", "desc"), limit(60)),
      (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubBots(); unsubLogs(); };
  }, [user]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function sendCommand(botId, command) {
    try {
      await updateDoc(doc(db, "bots", botId), { command, commandAt: serverTimestamp() });
    } catch (e) { console.error("Gagal kirim perintah:", e); }
  }

  if (user === undefined) return <div className="loader"><span>Memuat console…</span></div>;
  if (user === null) return null;

  const enriched = bots.map((b) => ({
    ...b, effStatus: effectiveStatus(b, now), online: isOnline(b, now),
  }));
  const runningCount = enriched.filter((b) => b.effStatus === "running").length;
  const onlineCount = enriched.filter((b) => b.online).length;
  const errorCount = enriched.filter((b) => b.effStatus === "error").length;
  const totalDone = enriched.reduce((s, b) => s + (b.tasksCompleted || 0), 0);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <div className="brand-name">Dashdrop</div>
            <div className="brand-sub">bot console · v1.1</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="user-tag">{user.email}</span>
          <button className="ghost-btn" onClick={() => signOut(auth)}>Keluar</button>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat live">
          <div className="stat-label">Bot aktif</div>
          <div className="stat-value mono">{runningCount}<span style={{ color: "var(--text-faint)", fontSize: 18 }}> / {bots.length}</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Worker online</div>
          <div className="stat-value mono">{onlineCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Task selesai</div>
          <div className="stat-value mono">{totalDone}</div>
        </div>
        <div className="stat err">
          <div className="stat-label">Bot error</div>
          <div className="stat-value mono">{errorCount}</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Workers</h2>
        <span className="count">{bots.length}</span>
      </div>

      {bots.length === 0 ? (
        <div className="empty">
          <h3>Belum ada bot terdaftar</h3>
          <p>Jalankan <code>bot-worker</code> di VPS kamu. Worker akan muncul di sini otomatis.</p>
        </div>
      ) : (
        <div className="grid">
          {enriched.map((b) => <BotCard key={b.id} bot={b} now={now} onCommand={sendCommand} />)}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 8 }}>
        <h2>Live log</h2>
        <span className="count">{logs.length}</span>
      </div>
      <div className="console">
        <div className="console-bar">
          <span className={"lamp" + (runningCount > 0 ? " on" : "")}></span>
          <span className={"lamp" + (runningCount > 0 ? " on" : "")}></span>
          <span>stream · {logs.length} baris terakhir</span>
        </div>
        <div className="console-body">
          {logs.length === 0 ? (
            <div className="log-empty">// belum ada aktivitas</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className={"log-line " + (l.level || "info")}>
                <span className="log-ts">{fmtTime(l.ts)}</span>
                <span className="log-msg">[{l.botName || l.botId || "—"}] {l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BotCard({ bot, now, onCommand }) {
  const s = bot.effStatus;
  const labels = { running: "RUNNING", idle: "IDLE", error: "ERROR", stopped: "STOPPED" };
  const isRunning = s === "running";
  const offline = !bot.online;

  return (
    <div className="bot">
      <div className="bot-top">
        <div>
          <div className="bot-name">{bot.name || bot.id}</div>
          <div className="bot-platform">{bot.platform || "unknown platform"}</div>
        </div>
        <div className={"status " + s}>
          <span className="dot"></span>{offline ? "OFFLINE" : labels[s]}
        </div>
      </div>

      <div className="bot-account">
        <div className="acc-row">
          <span className="acc-key">akun</span>
          <span className="acc-val">{bot.account || "—"}</span>
        </div>
        <div className="acc-row">
          <span className="acc-key">wallet</span>
          <span className="acc-val mono">{shortAddr(bot.wallet)}</span>
        </div>
        <div className="acc-row balance">
          <span className="acc-key">saldo</span>
          <span className="acc-val mono bal">
            {bot.balance != null ? `${bot.balance} ${bot.balanceSymbol || ""}` : "—"}
          </span>
        </div>
      </div>

      <div className="bot-meta">
        <div className="meta-item"><span className="meta-num ok">{bot.tasksCompleted || 0}</span><span className="meta-key">selesai</span></div>
        <div className="meta-item"><span className="meta-num bad">{bot.tasksFailed || 0}</span><span className="meta-key">gagal</span></div>
        <div className="meta-item"><span className="meta-num">{bot.queue || 0}</span><span className="meta-key">antrian</span></div>
      </div>

      <div className="bot-heartbeat">
        heartbeat: {bot.lastHeartbeat ? relTime(bot.lastHeartbeat, now) : "—"}
        {offline && <span className="offline-tag"> · worker offline</span>}
      </div>

      <div className="bot-actions">
        <button className="act start" disabled={offline || isRunning} onClick={() => onCommand(bot.id, "start")}>▶ Start</button>
        <button className="act stop" disabled={offline || (!isRunning && s !== "idle")} onClick={() => onCommand(bot.id, "stop")}>■ Stop</button>
      </div>

      {TASK_ACTIONS.length > 0 && (
        <div className="task-actions">
          {TASK_ACTIONS.map((t) => (
            <button key={t.action} className="task-btn" disabled={offline} onClick={() => onCommand(bot.id, t.action)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}
function isOnline(bot, now) { const hb = toMs(bot.lastHeartbeat); return hb && now - hb < STALE_MS; }
function effectiveStatus(bot, now) {
  const reported = bot.status || "stopped";
  if (reported === "running" && !isOnline(bot, now)) return "error";
  return reported;
}
function shortAddr(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
function fmtTime(ts) { const ms = toMs(ts); return ms ? new Date(ms).toLocaleTimeString("id-ID", { hour12: false }) : "--:--:--"; }
function relTime(ts, now) {
  const ms = toMs(ts); if (!ms) return "—";
  const d = Math.max(0, Math.floor((now - ms) / 1000));
  if (d < 5) return "baru saja";
  if (d < 60) return d + " detik lalu";
  if (d < 3600) return Math.floor(d / 60) + " menit lalu";
  return Math.floor(d / 3600) + " jam lalu";
}
