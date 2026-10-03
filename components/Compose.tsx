"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import RecipientField from "./RecipientField";
import { EMAIL_RE, api, escapeHtml, fmtDate, fmtSize, splitAddresses } from "@/lib/client";
import {
  MAX_ATTACHMENT_BYTES,
  type ComposeSeed, type Draft, type Field, type Recipients, type RemoteAttachment, type SendMeta, type Settings,
} from "@/lib/types";

/** Everything needed to send — or to reopen the window exactly as it was if the send is undone. */
export type Outgoing = { meta: SendMeta; files: File[]; seed: ComposeSeed; draftId?: string };

type Props = {
  seed: ComposeSeed;
  initialHtml: string;
  settings: Settings;
  ownEmail: string;
  contactsId: string;
  toast: (msg: string) => void;
  /** Window went away without sending; `changed` = drafts need a reload. */
  onClose: (changed: boolean, info?: { discardedId?: string; unsaved?: Draft }) => void;
  onSend: (out: Outgoing) => void;
};

type Local = { id: number; file: File };
type Mode = "normal" | "min" | "max";

const INLINE: { cmd: string; icon: IconName; title: string }[] = [
  { cmd: "bold", icon: "bold", title: "Bold (Ctrl+B)" },
  { cmd: "italic", icon: "italic", title: "Italic (Ctrl+I)" },
  { cmd: "underline", icon: "under", title: "Underline (Ctrl+U)" },
];
const BLOCK: { cmd: string; val?: string; icon: IconName; title: string }[] = [
  { cmd: "insertOrderedList", icon: "ol", title: "Numbered list" },
  { cmd: "insertUnorderedList", icon: "ul", title: "Bulleted list" },
  { cmd: "formatBlock", val: "blockquote", icon: "quote", title: "Quote" },
  { cmd: "removeFormat", icon: "clear", title: "Remove formatting" },
];
export const FONTS = [
  { label: "Sans Serif", value: "Arial, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Fixed width", value: "'Courier New', monospace" },
  { label: "Wide", value: "Verdana, sans-serif" },
];

let nextId = 1;
const ext = (name: string) => (name.split(".").pop() ?? "file").slice(0, 4);

export default function Compose({ seed, initialHtml, settings, ownEmail, contactsId, toast, onClose, onSend }: Props) {
  const [rcpt, setRcpt] = useState<Recipients>({ to: seed.to ?? [], cc: seed.cc ?? [], bcc: seed.bcc ?? [] });
  const [typed, setTyped] = useState<Record<Field, string>>({ to: "", cc: "", bcc: "" });
  const [showCc, setShowCc] = useState(!!seed.cc?.length);
  const [showBcc, setShowBcc] = useState(!!seed.bcc?.length);
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [files, setFiles] = useState<Local[]>(() => (seed.files ?? []).map((file) => ({ id: nextId++, file })));
  const [remote, setRemote] = useState<RemoteAttachment[]>(seed.remote ?? []);
  const [mode, setMode] = useState<Mode>("normal");
  const [fmtOpen, setFmtOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ left: number; bottom: number } | null>(null);
  const [customWhen, setCustomWhen] = useState("");

  const editorRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const fileInRef = useRef<HTMLInputElement>(null);
  const imgInRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const draftId = useRef(seed.id);

  // contentEditable is uncontrolled: seed it once on mount
  useEffect(() => {
    editorRef.current!.innerHTML = initialHtml;
    if (rcpt.to.length) {
      // replies: caret at the very top, above the quote
      const ed = editorRef.current!;
      ed.focus();
      const r = document.createRange();
      r.setStart(ed, 0);
      r.collapse(true);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    } else toRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalBytes = files.reduce((n, a) => n + a.file.size, 0) + remote.reduce((n, r) => n + r.size, 0);

  /** Turn half-typed addresses into chips and return the final lists. */
  function finalize(): Recipients {
    const out = {
      to: [...rcpt.to, ...splitAddresses(typed.to)],
      cc: [...rcpt.cc, ...splitAddresses(typed.cc)],
      bcc: [...rcpt.bcc, ...splitAddresses(typed.bcc)],
    };
    setRcpt(out);
    setTyped({ to: "", cc: "", bcc: "" });
    return out;
  }

  const untouched = (r: Recipients) =>
    !r.to.length && !r.cc.length && !r.bcc.length && !subject && !files.length &&
    (editorRef.current?.innerHTML ?? "") === initialHtml;

  // warn before closing the tab with unsent work
  const dirty = useRef(false);
  dirty.current = !untouched({ to: [...rcpt.to, ...splitAddresses(typed.to)], cc: rcpt.cc, bcc: rcpt.bcc });
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  /* ---------- attachments ---------- */
  function addFiles(list: FileList | File[]) {
    let bytes = totalBytes;
    const accepted: Local[] = [];
    for (const file of Array.from(list)) {
      if (bytes + file.size > MAX_ATTACHMENT_BYTES) {
        toast(`“${file.name}” is too big — attachments are limited to 40 MB in total`);
        continue;
      }
      bytes += file.size;
      accepted.push({ id: nextId++, file });
    }
    if (accepted.length) setFiles((f) => [...f, ...accepted]);
  }

  /* ---------- editor ---------- */
  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  };

  function insertLink() {
    const sel = getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const url = prompt("Link address", "https://");
    if (!url || url === "https://") return;
    if (range) { sel!.removeAllRanges(); sel!.addRange(range); }
    if (range && !range.collapsed) exec("createLink", url);
    else exec("insertHTML", `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
  }

  function insertImage(file: File) {
    if (file.size > 2 * 1024 * 1024) toast("Large inline images can be clipped by some inboxes — attaching may work better");
    const reader = new FileReader();
    reader.onload = () => exec("insertHTML", `<img src="${reader.result}" style="max-width:100%">`);
    reader.readAsDataURL(file);
  }

  /* ---------- actions ---------- */
  function send(scheduledAt?: string) {
    const r = finalize();
    if (!r.to.length) return toast("Add at least one recipient.");
    const bad = [...r.to, ...r.cc, ...r.bcc].filter((a) => !EMAIL_RE.test(a));
    if (bad.length) return toast(`Check this address: ${bad.join(", ")}`);
    if (!subject && settings.confirmNoSubject && !confirm("Send this message without a subject?")) return;

    const editor = editorRef.current!;
    onSend({
      meta: {
        ...r,
        subject,
        html: `<div style="font-family:${settings.font};font-size:${settings.fontSize}px">${editor.innerHTML}</div>`,
        text: editor.innerText,
        fromName: settings.fromName,
        replyTo: settings.replyTo,
        scheduledAt,
        inReplyTo: seed.inReplyTo,
        remote,
      },
      files: files.map((f) => f.file),
      seed: { ...seed, ...r, subject, html: editor.innerHTML, files: files.map((f) => f.file), remote },
      draftId: draftId.current,
    });
  }

  async function saveAndClose() {
    const r = finalize();
    if (untouched(r)) return onClose(false);
    try {
      await api("POST", "/api/drafts", { id: draftId.current, ...r, subject, html: editorRef.current!.innerHTML });
      toast(files.length || remote.length ? "Draft saved — attachments aren’t kept in drafts" : "Draft saved");
      onClose(true);
    } catch {
      // don't throw the message away: hand it back so it's kept as a draft in this browser
      onClose(false, {
        unsaved: {
          id: draftId.current || `local-${Date.now().toString(36)}`,
          ...r,
          subject,
          html: editorRef.current!.innerHTML,
          savedAt: new Date().toISOString(),
        },
      });
    }
  }

  async function discard() {
    if (draftId.current) await api("DELETE", `/api/drafts/${encodeURIComponent(draftId.current)}`).catch(() => {});
    toast("Draft discarded");
    onClose(true, { discardedId: draftId.current });
  }

  function schedule(preset: "tomorrow-am" | "tomorrow-pm" | "monday" | "custom") {
    const d = new Date();
    if (preset === "custom") {
      if (!customWhen) return toast("Pick a date and time first");
      const parsed = new Date(customWhen);
      if (isNaN(parsed.getTime())) return toast("Pick a valid date and time");
      d.setTime(parsed.getTime());
    } else if (preset === "monday") {
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      d.setHours(8, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 1);
      d.setHours(preset === "tomorrow-am" ? 8 : 13, 0, 0, 0);
    }
    if (d <= new Date()) return toast("Pick a time in the future");
    setMenu(null);
    send(d.toISOString());
  }

  const fieldProps = (f: Field) => ({
    values: rcpt[f],
    onValues: (v: string[]) => setRcpt((r) => ({ ...r, [f]: v })),
    text: typed[f],
    onText: (t: string) => setTyped((s) => ({ ...s, [f]: t })),
    listId: contactsId,
  });

  const keepSelection = (e: React.MouseEvent) => { if ((e.target as Element).closest("button")) e.preventDefault(); };
  const presetLabel = (d: Date) => d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const tomorrow = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d; };

  return (
    <>
      {mode === "max" && <div className="scrim" onClick={() => setMode("normal")} />}
      <section
        className={`compose glass-thick ${mode === "normal" ? "" : mode}`}
        role="dialog"
        aria-label="New message"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); }
          if (e.key === "Escape" && mode === "max") setMode("normal");
        }}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        <div className="c-head" onClick={() => setMode((m) => (m === "min" ? "normal" : "min"))}>
          <span className="title">{subject || (seed.inReplyTo ? "Reply" : "New Message")}</span>
          <button className="icon-btn sm" title={mode === "min" ? "Expand" : "Minimize"} onClick={(e) => { e.stopPropagation(); setMode(mode === "min" ? "normal" : "min"); }}>
            <Icon name="min" />
          </button>
          <button className="icon-btn sm" title={mode === "max" ? "Exit full screen" : "Full screen"} onClick={(e) => { e.stopPropagation(); setMode(mode === "max" ? "normal" : "max"); }}>
            <Icon name="max" />
          </button>
          <button className="icon-btn sm" title="Save draft & close" onClick={(e) => { e.stopPropagation(); saveAndClose(); }}>
            <Icon name="x" />
          </button>
        </div>

        <div className="c-body">
          <div className="field">
            <label>From</label>
            <span style={{ color: "var(--text-2)" }}>{settings.fromName} &lt;{ownEmail}&gt;</span>
          </div>
          <RecipientField label="To" inputRef={toRef} {...fieldProps("to")}>
            <span className="links">
              {!showCc && <button type="button" onClick={() => setShowCc(true)}>Cc</button>}
              {!showBcc && <button type="button" onClick={() => setShowBcc(true)}>Bcc</button>}
            </span>
          </RecipientField>
          {showCc && <RecipientField label="Cc" {...fieldProps("cc")} />}
          {showBcc && <RecipientField label="Bcc" {...fieldProps("bcc")} />}
          <div className="field">
            <input className="subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div
            ref={editorRef}
            className="editor"
            contentEditable
            suppressContentEditableWarning
            data-ph="Write your message…"
            style={{ fontFamily: settings.font, fontSize: settings.fontSize }}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length) { e.preventDefault(); addFiles(pasted); }
            }}
          />

          {(files.length > 0 || remote.length > 0) && (
            <div className="c-attachments">
              {remote.map((r) => (
                <div key={`r-${r.id}`} className="att-card" title="Forwarded from the original message">
                  <span className="ext">{ext(r.filename)}</span>
                  <span className="meta"><span>{r.filename}</span><small>{fmtSize(r.size)} · forwarded</small></span>
                  <button className="icon-btn sm" title="Remove" onClick={() => setRemote((x) => x.filter((y) => y.id !== r.id))}><Icon name="x" /></button>
                </div>
              ))}
              {files.map((a) => (
                <div key={a.id} className="att-card">
                  <span className="ext">{ext(a.file.name)}</span>
                  <span className="meta"><span title={a.file.name}>{a.file.name}</span><small>{fmtSize(a.file.size)}</small></span>
                  <button className="icon-btn sm" title="Remove" onClick={() => setFiles((f) => f.filter((x) => x.id !== a.id))}><Icon name="x" /></button>
                </div>
              ))}
            </div>
          )}

          {fmtOpen && (
            <div className="fmt glass-thin" onMouseDown={keepSelection}>
              <select title="Font" defaultValue={settings.font} onChange={(e) => exec("fontName", e.target.value)}>
                {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select title="Size" defaultValue="3" onChange={(e) => exec("fontSize", e.target.value)}>
                <option value="2">Small</option>
                <option value="3">Normal</option>
                <option value="5">Large</option>
                <option value="6">Huge</option>
              </select>
              <span className="sep" />
              {INLINE.map((b) => (
                <button key={b.cmd} className="icon-btn sm" title={b.title} onClick={() => exec(b.cmd)}><Icon name={b.icon} /></button>
              ))}
              <input type="color" title="Text colour" defaultValue="#0b2d4d" onChange={(e) => exec("foreColor", e.target.value)} />
              <span className="sep" />
              {BLOCK.map((b) => (
                <button key={b.cmd} className="icon-btn sm" title={b.title} onClick={() => exec(b.cmd, b.val)}><Icon name={b.icon} /></button>
              ))}
            </div>
          )}

          <div className="c-foot">
            <div className="send-group">
              <button className="btn primary" onClick={() => send()} title="Send (Ctrl+Enter)">Send</button>
              <button
                className="btn primary more"
                title="Schedule send"
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu(menu ? null : { left: Math.max(8, r.left - 60), bottom: window.innerHeight - r.top + 8 });
                }}
              >
                <Icon name="down" />
              </button>
            </div>
            <button className={`icon-btn${fmtOpen ? " on" : ""}`} title="Formatting" aria-pressed={fmtOpen} onClick={() => setFmtOpen((o) => !o)}><Icon name="format" /></button>
            <button className="icon-btn" title="Attach files" onClick={() => fileInRef.current?.click()}><Icon name="clip" /></button>
            <button className="icon-btn" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><Icon name="link" /></button>
            <button className="icon-btn" title="Insert image" onClick={() => imgInRef.current?.click()}><Icon name="img" /></button>
            {totalBytes > 0 && <span className="size">{fmtSize(totalBytes)} of 40 MB</span>}
            <span className="spacer" />
            <button className="icon-btn" title="Discard draft" onClick={discard}><Icon name="trash" /></button>
          </div>
        </div>

        {dragging && <div className="dropzone">Drop to attach</div>}
        <input ref={fileInRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={imgInRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) insertImage(f); }} />
      </section>

      {menu && (
        <div ref={menuRef} role="menu" className="menu glass-thick" style={{ left: menu.left, bottom: menu.bottom }}>
          <div className="lbl">Schedule send</div>
          <button role="menuitem" onClick={() => schedule("tomorrow-am")}>Tomorrow morning <small>{presetLabel(tomorrow(8))}</small></button>
          <button role="menuitem" onClick={() => schedule("tomorrow-pm")}>Tomorrow afternoon <small>{presetLabel(tomorrow(13))}</small></button>
          <button role="menuitem" onClick={() => schedule("monday")}>Monday morning <small>8:00 AM</small></button>
          <div className="lbl">Pick date &amp; time</div>
          <input type="datetime-local" value={customWhen} onChange={(e) => setCustomWhen(e.target.value)} />
          <button role="menuitem" onClick={() => schedule("custom")}>
            Schedule{customWhen && !isNaN(new Date(customWhen).getTime()) ? <small>{fmtDate(new Date(customWhen).toISOString(), true)}</small> : null}
          </button>
        </div>
      )}
    </>
  );
}
