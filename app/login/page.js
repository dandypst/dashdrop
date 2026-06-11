"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/");
    });
    return () => unsub();
  }, [router]);

  async function submit() {
    setErr("");
    if (!email || !password) {
      setErr("Email dan password wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      router.replace("/");
    } catch (e) {
      setErr(humanError(e.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-mark">D</div>
        </div>
        <div className="auth-title">
          {mode === "login" ? "Masuk ke Console" : "Buat akun"}
        </div>
        <div className="auth-sub">Kontrol & monitoring bot kamu</div>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="kamu@email.com"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••••••"
          />
        </div>

        <button className="primary-btn" onClick={submit} disabled={busy}>
          {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
        </button>

        {err && <div className="auth-err">{err}</div>}

        <div className="auth-toggle">
          {mode === "login" ? "Belum punya akun? " : "Sudah punya akun? "}
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }}>
            {mode === "login" ? "Daftar" : "Masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}

function humanError(code) {
  const map = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/email-already-in-use": "Email sudah terdaftar.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
  };
  return map[code] || "Terjadi kesalahan. Coba lagi.";
}
