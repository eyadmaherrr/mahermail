"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar";
import Icon from "./Icon";
import { api, escapeHtml, fmtDate, fmtSize, isScheduled, parseAddress, sanitizeHtml, textToHtml } from "@/lib/client";
import type { Item } from "@/lib/items";
import { loadReceived, peekReceived } from "@/lib/prefetch";
import type { ComposeSeed, ReceivedEmail, RemoteAttachment, SentEmail } from "@/lib/types";

export type ReaderActions = { reply: () => void; replyAll: () => void; forward: () => void };

type Props = {
  item: Item;
  sentRecord?: SentEmail;
  ownEmail: string;
  ownName: string;
  signatureHtml: string;
  blockImages: boolean;
  onBack: () => void;
  onToggle: (flag: "starred" | "important") => void;
  /** hide the message (or bring it back if it's already hidden) */
  onHide: () => void;
  onMarkUnread: () => void;
  onCompose: (seed: ComposeSeed) => void;
  onDelete: () => void;
  onCancelScheduled: () => void;
  actionsRef: React.RefObject<ReaderActions | null>;
  /** position in the current list, for the previous/next arrows */
  position: { index: number; total: number } | null;
  onPrev: () => void;
  onNext: () => void;
};

const reSubject = (s: string, prefix: "Re" | "Fwd") =>
  new RegExp(`^${prefix}:`, "i").test(s) ? s : `${prefix}: ${s}`;

export default function Reader(p: Props) {
  const { item } = p;
  const [received, setReceived] = useState<ReceivedEmail | null>(() => (item.kind === "received" ? peekReceived(item.id) : null));
  const [fetchedSent, setFetchedSent] = useState<SentEmail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (item.kind === "received" && !peekReceived(item.id)) {
      loadReceived(item.id)
        .then((d) => live && setReceived(d))
        .catch((e) => live && setError((e as Error).message));
    }
    if (item.kind === "sent") {
      api<{ status: string }>("GET", `/api/status/${encodeURIComponent(item.id)}`)
        .then((s) => live && setStatus(s.status))
        .catch(() => {});
      if (!p.sentRecord || (!p.sentRecord.html && !p.sentRecord.text)) {
        api<SentEmail>("GET", `/api/sent/${encodeURIComponent(item.id)}`)
          .then((s) => live && setFetchedSent(s))
          .catch((e) => live && setError((e as Error).message));
      }
    }
    return () => { live = false; };
  }, [item.id, item.kind, item.hasAttachments, p.sentRecord]);

  const sent = fetchedSent ?? p.sentRecord;

  // Attachment names and sizes are already known (from the list, or our own Sent record), so the
  // files show instantly. Links go through /api/files, which fetches a fresh download URL on click.
  const enc = encodeURIComponent;
  const files: DockFile[] =
    item.kind === "received"
      ? (received?.attachments.filter((a) => a.content_disposition !== "inline")
          .map((a) => ({ id: a.id, filename: a.filename ?? "attachment", size: a.size })) ?? item.files ?? [])
          .map((a) => ({ ...a, href: `/api/files/received/${enc(item.id)}?id=${enc(a.id)}` }))
      : (sent?.attachments ?? []).map((a, i) => ({
          id: `${i}-${a.filename}`, filename: a.filename, size: a.size,
          href: `/api/files/sent/${enc(item.id)}?name=${enc(a.filename)}`,
        }));
  const remote: RemoteAttachment[] = files.map((f) => ({
    kind: item.kind === "received" ? "received" : "sent",
    emailId: item.id,
    id: item.kind === "received" ? f.id : "", // sent attachments are looked up by filename
    filename: f.filename,
    size: f.size,
  }));

  /* ---------- reply / forward seeds ---------- */
  const quoteHeader = (date: string, who: string) =>
    `<div style="color:#667085">On ${escapeHtml(fmtDate(date, true))}, ${escapeHtml(who)} wrote:</div>`;

  function reply(all: boolean) {
    if (received) {
      const sender = parseAddress(received.reply_to[0] ?? received.from).email;
      const own = p.ownEmail.toLowerCase();
      const others = all
        ? [...received.to, ...received.cc].map((a) => parseAddress(a).email)
            .filter((a, i, arr) => a.toLowerCase() !== own && a.toLowerCase() !== sender.toLowerCase() && arr.indexOf(a) === i)
        : [];
      const body = received.html ? sanitizeHtml(received.html) : textToHtml(received.text ?? "");
      p.onCompose({
        to: [sender],
        cc: others,
        subject: reSubject(received.subject, "Re"),
        html: `<br>${p.signatureHtml}<br>${quoteHeader(received.created_at, received.from)}<blockquote>${body}</blockquote>`,
        inReplyTo: received.message_id,
      });
    } else if (sent) {
      // a follow-up to our own message goes back to the same people
      p.onCompose({
        to: sent.to,
        cc: all ? sent.cc : [],
        subject: reSubject(sent.subject, "Re"),
        html: `<br>${p.signatureHtml}<br>${quoteHeader(sent.sentAt, p.ownName)}<blockquote>${sent.html}</blockquote>`,
      });
    }
  }

  function forward() {
    if (received) {
      const body = received.html ? sanitizeHtml(received.html) : textToHtml(received.text ?? "");
      p.onCompose({
        subject: reSubject(received.subject, "Fwd"),
        html:
          `<br>${p.signatureHtml}<br><div style="color:#667085">---------- Forwarded message ---------<br>` +
          `From: ${escapeHtml(received.from)}<br>Date: ${escapeHtml(fmtDate(received.created_at, true))}<br>` +
          `Subject: ${escapeHtml(received.subject)}<br>To: ${escapeHtml(received.to.join(", "))}</div><br>${body}`,
        remote,
      });
    } else if (sent) {
      p.onCompose({
        subject: reSubject(sent.subject, "Fwd"),
        html: `<br>${p.signatureHtml}<br><div style="color:#667085">---------- Forwarded message ---------</div><br>${sent.html}`,
        remote,
      });
    }
  }

  // let keyboard shortcuts reach these
  p.actionsRef.current = { reply: () => reply(false), replyAll: () => reply(true), forward };

  /* ---------- render ---------- */
  const isReceived = item.kind === "received";
  const html = isReceived
    ? received ? (received.html ?? `<pre>${escapeHtml(received.text ?? "")}</pre>`) : null
    : sent ? (sent.html || (sent.text ? `<pre>${escapeHtml(sent.text)}</pre>` : "<p style=\"color: #667085; font-style: italic;\">(No message content)</p>")) : null;
  const totalSize = files.reduce((n, f) => n + f.size, 0);
  const fromLine = isReceived ? parseAddress(received?.from ?? item.who) : { name: p.ownName, email: p.ownEmail };
  const toLine = isReceived ? received?.to ?? [] : sent?.to ?? [];
  const ccLine = isReceived ? received?.cc ?? [] : sent?.cc ?? [];
  const scheduled = sent ? isScheduled(sent) : false;

  return (
    <section className="panel glass reader-panel" aria-label="Message">
      <div className="reader">
        <div className="reader-bar">
          <button className="btn ghost sm back-btn" title="Back to list (Esc)" onClick={p.onBack}><Icon name="back" />Back</button>
          <span className="spacer" />
          {p.position && (
            <div className="pager">
              <span>{p.position.index + 1} of {p.position.total}</span>
              <div className="capsule glass-thin">
                <button className="icon-btn sm" title="Newer (K)" disabled={p.position.index === 0} onClick={p.onPrev}><Icon name="up" /></button>
                <button className="icon-btn sm" title="Older (J)" disabled={p.position.index >= p.position.total - 1} onClick={p.onNext}><Icon name="downArrow" /></button>
              </div>
            </div>
          )}
          <div className="capsule glass-thin">
            <button className="icon-btn sm" title="Reply (R)" onClick={() => reply(false)} disabled={isReceived && !received}><Icon name="reply" /></button>
            <button className="icon-btn sm" title="Reply all (A)" onClick={() => reply(true)} disabled={isReceived && !received}><Icon name="replyAll" /></button>
            <button className="icon-btn sm" title="Forward (F)" onClick={forward} disabled={isReceived && !received}><Icon name="fwd" /></button>
          </div>
          <div className="capsule glass-thin">
            <button className={`icon-btn sm${item.starred ? " on-star" : ""}`} title={item.starred ? "Unstar (S)" : "Star (S)"} aria-pressed={item.starred} onClick={() => p.onToggle("starred")}>
              <Icon name={item.starred ? "starFill" : "star"} />
            </button>
            <button className={`icon-btn sm${item.important ? " on-important" : ""}`} title={item.important ? "Not important (I)" : "Important (I)"} aria-pressed={item.important} onClick={() => p.onToggle("important")}>
              <Icon name={item.important ? "importantFill" : "important"} />
            </button>
            <button className="icon-btn sm" title={item.hidden ? "Unhide" : "Hide"} onClick={p.onHide}>
              <Icon name={item.hidden ? "show" : "hide"} />
            </button>
            {isReceived ? (
              <button className="icon-btn sm" title="Mark as unread (U)" onClick={p.onMarkUnread}><Icon name="mail" /></button>
            ) : (
              <button className="icon-btn sm" title="Remove from this list" onClick={p.onDelete}><Icon name="trash" /></button>
            )}
          </div>
        </div>

        <div className="reader-inner">
        <h1>{item.subject || "(no subject)"}</h1>
        <div className="tags">
          {item.important && <span className="tag important"><Icon name="importantFill" />Important</span>}
          {item.starred && <span className="tag starred"><Icon name="starFill" />Starred</span>}
          {item.hidden && <span className="tag"><Icon name="hide" />Hidden</span>}
          {isReceived && !item.hidden && <span className="tag"><Icon name="inbox" />Inbox</span>}
          {!isReceived && !scheduled && !sent?.canceled && <span className={`tag ${status ?? ""}`}>{status ? status.replace(/_/g, " ") : "Sent"}</span>}
          {scheduled && <span className="tag scheduled"><Icon name="clock" />Scheduled · {fmtDate(sent!.scheduledAt!, true)}</span>}
          {sent?.canceled && <span className="tag canceled">Canceled</span>}
        </div>

        <div className="sender">
          <Avatar seed={isReceived ? received?.from ?? item.who : p.ownEmail} large />
          <div className="lines">
            <div><b>{fromLine.name}</b> <span className="addr">&lt;{fromLine.email}&gt;</span></div>
            <div>to {toLine.join(", ") || "…"}{ccLine.length > 0 && <> · cc {ccLine.join(", ")}</>}</div>
          </div>
          <div className="date">{fmtDate(isReceived ? received?.created_at ?? item.date : item.date, true)}</div>
        </div>

        {scheduled && (
          <div className="banner">
            <Icon name="clock" />
            <span>This message will be sent {fmtDate(sent!.scheduledAt!, true)}.</span>
            <span className="spacer" />
            <button className="btn danger sm" onClick={p.onCancelScheduled}>Cancel send</button>
          </div>
        )}

        {error ? (
          <div className="banner">Couldn’t load this message: {error}</div>
        ) : html === null ? (
          <div className="skeleton" style={{ height: 240 }} />
        ) : (
          <MailFrame key={item.id} html={html} block={isReceived && p.blockImages} />
        )}

        <div className="reply-bar">
          <button className="btn ghost" onClick={() => reply(false)} disabled={isReceived && !received}><Icon name="reply" />Reply</button>
          <button className="btn ghost" onClick={() => reply(true)} disabled={isReceived && !received}><Icon name="replyAll" />Reply all</button>
          <button className="btn ghost" onClick={forward} disabled={isReceived && !received}><Icon name="fwd" />Forward</button>
        </div>
        </div>

        {files.length > 0 && <AttachmentDock files={files} totalSize={totalSize} />}
      </div>
    </section>
  );
}

type DockFile = { id: string; filename: string; size: number; href: string };

/** Files in the message, pinned to the bottom of the reader so they're always one click away. */
function AttachmentDock({ files, totalSize }: { files: DockFile[]; totalSize: number }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`att-dock glass-thick${open ? "" : " closed"}`} aria-label="Attachments">
      <button className="att-dock-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="clip" />
        <b>{files.length} {files.length === 1 ? "attachment" : "attachments"}</b>
        <small>{fmtSize(totalSize)}</small>
        <span className="spacer" />
        <span className="chev"><Icon name="down" /></span>
      </button>
      {open && (
        <div className="att-row">
          {files.map((f) => (
            <a key={f.id} className="att-card glass-thin" href={f.href} target="_blank" rel="noreferrer" title={`Open ${f.filename}`}>
              <span className="ext" data-type={fileType(f.filename)}>{(f.filename.split(".").pop() ?? "file").slice(0, 4)}</span>
              <span className="meta"><span>{f.filename}</span><small>{fmtSize(f.size)}</small></span>
              <Icon name="download" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function fileType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (["xls", "xlsx", "csv", "numbers"].includes(ext)) return "sheet";
  if (["doc", "docx", "pages", "txt", "rtf"].includes(ext)) return "doc";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  return "other";
}

/**
 * Renders email HTML in an isolated, script-less iframe.
 * `allow-same-origin` is only there so we can measure its height — without `allow-scripts` nothing inside can run.
 */
function MailFrame({ html, block }: { html: string; block: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [showImages, setShowImages] = useState(!block);
  const hasRemote = useMemo(() => /<img[^>]+src\s*=\s*["']?\s*https?:|url\(\s*["']?https?:/i.test(html), [html]);

  const srcDoc = useMemo(() => {
    const csp = showImages
      ? "default-src 'none'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:"
      : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:";
    const body = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh[^>]*>/gi, "");
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0}body{padding:20px 22px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:#17212b;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e3e8ef;color:#475467}a{color:#176b9c}</style></head><body>${body}</body></html>`;
  }, [html, showImages]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | undefined;
    const fit = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      frame.style.height = `${doc.documentElement.scrollHeight}px`;
      if (!ro && doc.body) { ro = new ResizeObserver(() => { frame.style.height = `${doc.documentElement.scrollHeight}px`; }); ro.observe(doc.body); }
    };
    frame.addEventListener("load", fit);
    return () => { frame.removeEventListener("load", fit); ro?.disconnect(); };
  }, [srcDoc]);

  return (
    <>
      {!showImages && hasRemote && (
        <div className="banner">
          <Icon name="img" />
          <span>Remote images are hidden to protect your privacy.</span>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={() => setShowImages(true)}>Show images</button>
        </div>
      )}
      <iframe
        ref={ref}
        className="mail-frame"
        title="Message body"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
      />
    </>
  );
}
