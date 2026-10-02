"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import Icon from "./Icon";
import { prefs } from "@/lib/client";
import type { Account } from "@/lib/accounts";

type Option = Account & { enabled: boolean };

export default function LoginForm({ accounts }: { accounts: Option[] }) {
  const [selected, setSelected] = useState<Option | null>(null);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // remember which mailbox was used last on this computer and offer it first
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => setLastId(prefs.get<string | null>("lastAccount", null)), []);

  useEffect(() => {
    if (selected) pwRef.current?.focus();
  }, [selected]);

  const choose = (a: Option) => {
    if (!a.enabled) return;
    setSelected(a);
    setPassword("");
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: selected.id, password, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn’t sign in");
      prefs.set("lastAccount", selected.id);
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
      shake();
      setBusy(false);
      pwRef.current?.focus();
    }
  }

  // the macOS "wrong password" shake — skipped for people who reduce motion
  function shake() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    fieldRef.current?.animate(
      [0, -10, 9, -7, 5, -3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 420, easing: "ease-out" },
    );
  }

  const ordered = lastId
    ? [...accounts].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0))
    : accounts;

  return (
    <div className="root">
      <main className="login">
        <div className="login-card glass-thick">
          <div className="login-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" />
            <h1>Maher Mail</h1>
            <p>{selected ? "Enter your password" : "Choose your mailbox"}</p>
          </div>

          {!selected ? (
            <ul className="account-list" role="list">
              {ordered.map((a) => (
                <li key={a.id}>
                  <button className="account" onClick={() => choose(a)} disabled={!a.enabled} title={a.enabled ? undefined : "No password set in .env"}>
                    <Avatar seed={a.email} />
                    <span className="who">
                      <b>{a.name}</b>
                      <small>{a.email}</small>
                    </span>
                    {a.id === lastId && <span className="tag">Last used</span>}
                    <Icon name="fwd" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <form className="signin" onSubmit={submit} key={selected.id}>
              <div className="signin-who">
                <Avatar seed={selected.email} large />
                <b>{selected.name}</b>
                <small>{selected.email}</small>
              </div>

              <div ref={fieldRef} className={`pw-field glass-thin${error ? " bad" : ""}`}>
                <input
                  ref={pwRef}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  aria-label={`Password for ${selected.email}`}
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  disabled={busy}
                />
                <button type="submit" className="pw-go" disabled={!password || busy} title="Sign in">
                  {busy ? <span className="spinner" /> : <Icon name="fwd" />}
                </button>
              </div>
              <p className="login-error" id="login-error" role="alert">{error ?? " "}</p>

              <label className="remember">
                <span className="switch"><input type="checkbox" role="switch" checked={remember} onChange={(e) => setRemember(e.target.checked)} /></span>
                Keep me signed in on this computer
              </label>

              <button type="button" className="btn ghost sm other" onClick={() => { setSelected(null); setError(null); }}>
                <Icon name="back" />Choose a different mailbox
              </button>
            </form>
          )}
        </div>
        <p className="login-foot">Dr. Maher Mahmoud · Dermatology, Laser &amp; Aesthetic Medicine</p>
      </main>
    </div>
  );
}
