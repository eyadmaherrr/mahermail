"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { FONTS } from "./Compose";
import { EMAIL_RE } from "@/lib/client";
import type { Settings } from "@/lib/types";

type Tab = "account" | "inbox" | "compose" | "appearance" | "shortcuts";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "account", label: "Account", icon: "person" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "compose", label: "Compose", icon: "pen" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard" },
];

export const SHORTCUTS: [string, string][] = [
  ["C", "Compose a new message"],
  ["/", "Search mail"],
  ["J / K", "Next / previous message"],
  ["R", "Reply"],
  ["A", "Reply all"],
  ["F", "Forward"],
  ["S", "Star / unstar"],
  ["I", "Mark important / not important"],
  ["U", "Mark as unread"],
  ["G then I / S / T", "Go to Inbox / Sent / Starred"],
  ["X", "Select the focused message (Space works too)"],
  ["[", "Collapse / expand the sidebar"],
  ["Esc", "Back to the list"],
  ["Ctrl + Enter", "Send (while writing)"],
];

type Props = {
  open: boolean;
  settings: Settings;
  ownEmail: string;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onSignOut: () => void;
};

export default function SettingsSheet({ open, settings, ownEmail, onChange, onClose, onSignOut }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("account");
  const [name, setName] = useState(settings.fromName);
  const [replyTo, setReplyTo] = useState(settings.replyTo);

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      setName(settings.fromName);
      setReplyTo(settings.replyTo);
      d.showModal();
    } else if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // the signature editor is uncontrolled; refresh it whenever the account tab is shown
  useEffect(() => {
    if (open && tab === "account" && sigRef.current) sigRef.current.innerHTML = settings.signature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const replyToBad = replyTo.trim() !== "" && !EMAIL_RE.test(replyTo.trim());

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-label="Settings">
      <div className="sheet-body glass-thick">
        <nav className="sheet-nav">
          <h2>Settings</h2>
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} />{t.label}
            </button>
          ))}
        </nav>

        <div className="sheet-main">
          <div className="sheet-scroll">
            {tab === "account" && (
              <>
                <h3>Sender</h3>
                <div className="group">
                  <Row label="Display name" hint="Recipients see this next to your address.">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => name.trim() && name !== settings.fromName && onChange({ fromName: name.trim() })}
                    />
                  </Row>
                  <Row label="Email address" hint="The mailbox you’re signed in to.">
                    <input type="text" value={ownEmail} readOnly />
                  </Row>
                  <Row label="Reply-to" hint={replyToBad ? "That doesn’t look like an email address." : "Optional — replies go here instead."}>
                    <input
                      type="email"
                      value={replyTo}
                      placeholder="Same as sender"
                      onChange={(e) => setReplyTo(e.target.value)}
                      onBlur={() => !replyToBad && replyTo.trim() !== settings.replyTo && onChange({ replyTo: replyTo.trim() })}
                      style={replyToBad ? { borderColor: "var(--danger)" } : undefined}
                    />
                  </Row>
                </div>
                <h3>Signature</h3>
                <div className="group">
                  <div className="setting stack">
                    <div className="lbl"><small>Added to new messages, replies and forwards. Formatting is kept.</small></div>
                    <div
                      ref={sigRef}
                      className="sig-edit"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => e.currentTarget.innerHTML !== settings.signature && onChange({ signature: e.currentTarget.innerHTML })}
                    />
                  </div>
                </div>
                <h3>Session</h3>
                <div className="group">
                  <Row label="Sign out" hint="Return to the mailbox picker. Your mail and settings stay saved.">
                    <button className="btn danger sm" onClick={onSignOut}><Icon name="logout" />Sign out</button>
                  </Row>
                </div>
              </>
            )}

            {tab === "inbox" && (
              <>
                <h3>Mailbox</h3>
                <div className="group">
                  <Row label="Check for new mail">
                    <select value={settings.refreshSeconds} onChange={(e) => onChange({ refreshSeconds: Number(e.target.value) })}>
                      <option value={0}>Manually</option>
                      <option value={30}>Every 30 seconds</option>
                      <option value={60}>Every minute</option>
                      <option value={300}>Every 5 minutes</option>
                      <option value={900}>Every 15 minutes</option>
                    </select>
                  </Row>
                  <Toggle
                    label="Desktop notifications"
                    hint="Get a notification when new mail arrives."
                    checked={settings.notifyNewMail}
                    onChange={async (v) => {
                      if (v && "Notification" in window && Notification.permission !== "granted") {
                        const perm = await Notification.requestPermission();
                        if (perm !== "granted") return;
                      }
                      onChange({ notifyNewMail: v });
                    }}
                  />
                  <Toggle label="Mark as read when opened" checked={settings.markReadOnOpen} onChange={(v) => onChange({ markReadOnOpen: v })} />
                </div>
                <h3>Privacy</h3>
                <div className="group">
                  <Toggle
                    label="Block remote images"
                    hint="Stops senders from knowing when you open their email. You can still load images per message."
                    checked={settings.blockRemoteImages}
                    onChange={(v) => onChange({ blockRemoteImages: v })}
                  />
                </div>
              </>
            )}

            {tab === "compose" && (
              <>
                <h3>Sending</h3>
                <div className="group">
                  <Row label="Undo send" hint="How long you have to take a message back after pressing Send.">
                    <select value={settings.undoSeconds} onChange={(e) => onChange({ undoSeconds: Number(e.target.value) })}>
                      <option value={0}>Off</option>
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds</option>
                    </select>
                  </Row>
                  <Toggle label="Warn before sending without a subject" checked={settings.confirmNoSubject} onChange={(v) => onChange({ confirmNoSubject: v })} />
                </div>
                <h3>Default text style</h3>
                <div className="group">
                  <Row label="Font">
                    <select value={settings.font} onChange={(e) => onChange({ font: e.target.value })}>
                      {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </Row>
                  <Row label="Size">
                    <Segmented
                      value={String(settings.fontSize)}
                      options={[["13", "Small"], ["14", "Normal"], ["16", "Large"]]}
                      onChange={(v) => onChange({ fontSize: Number(v) })}
                    />
                  </Row>
                  <div className="setting">
                    <div className="lbl" style={{ fontFamily: settings.font, fontSize: settings.fontSize }}>
                      Preview — Thank you for visiting the clinic. Your results are attached.
                    </div>
                  </div>
                </div>
              </>
            )}

            {tab === "appearance" && (
              <>
                <h3>Theme</h3>
                <div className="group">
                  <Row label="Appearance">
                    <Segmented
                      value={settings.theme}
                      options={[["system", "Automatic"], ["light", "Light"], ["dark", "Dark"]]}
                      onChange={(v) => onChange({ theme: v })}
                    />
                  </Row>
                  <Row label="List density">
                    <Segmented
                      value={settings.density}
                      options={[["comfortable", "Comfortable"], ["compact", "Compact"]]}
                      onChange={(v) => onChange({ density: v })}
                    />
                  </Row>
                  <Toggle
                    label="Reduce transparency"
                    hint="Uses solid surfaces instead of glass. Also follows your system setting."
                    checked={settings.reduceTransparency}
                    onChange={(v) => onChange({ reduceTransparency: v })}
                  />
                  <Toggle
                    label="Compact sidebar"
                    hint="Shows mailboxes as icons only. Press [ to switch any time."
                    checked={settings.sidebarCollapsed}
                    onChange={(v) => onChange({ sidebarCollapsed: v })}
                  />
                </div>
              </>
            )}

            {tab === "shortcuts" && (
              <>
                <h3>Keyboard</h3>
                <div className="group">
                  <Toggle label="Keyboard shortcuts" hint="Single-key shortcuts while you’re not typing." checked={settings.shortcuts} onChange={(v) => onChange({ shortcuts: v })} />
                </div>
                <h3>Reference</h3>
                <div className="group">
                  <div className="kbd-list">
                    {SHORTCUTS.map(([k, d]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <span>{k.split(" ").map((p, i) => (["/", "then", "+"].includes(p) ? <span key={i} style={{ margin: "0 4px", color: "var(--muted)" }}>{p}</span> : <kbd key={i}>{p}</kbd>))}</span>
                        <span style={{ color: "var(--text-2)" }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="sheet-foot">
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="lbl"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting" style={{ cursor: "pointer" }}>
      <div className="lbl"><b>{label}</b>{hint && <small>{hint}</small>}</div>
      <span className="switch"><input type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /></span>
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
