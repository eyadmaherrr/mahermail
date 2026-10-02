import { isScheduled, stripHtml } from "./client";
import type { Draft, Flag, Flags, InboxItem, ItemMeta, SentEmail } from "./types";

export type View = "inbox" | "starred" | "important" | "sent" | "scheduled" | "drafts" | "hidden";

/** One row in any list, whatever kind of message it is. */
export type Item = {
  id: string;
  kind: "received" | "sent" | "draft";
  /** sender for received mail, recipients for sent mail and drafts */
  who: string;
  whoSeed: string;
  subject: string;
  snippet: string;
  date: string;
  hasAttachments: boolean;
  unread: boolean;
  starred: boolean;
  important: boolean;
  hidden: boolean;
  scheduled: boolean;
  canceled: boolean;
  /** which of our addresses it arrived at, shown when viewing all mailboxes */
  deliveredTo?: string;
  /** real attachments (not inline images) of received mail, known from the list already */
  files?: { id: string; filename: string; size: number }[];
};

const flagState = (f: Flag | undefined) => ({ starred: !!f?.starred, important: !!f?.important, hidden: !!f?.hidden });

export function fromReceived(e: InboxItem, flags: Flags, ownEmail: string): Item {
  const f = flags[e.id];
  const files = e.attachments
    .filter((a) => a.content_disposition !== "inline")
    .map((a) => ({ id: a.id, filename: a.filename ?? "attachment", size: a.size }));
  const domain = ownEmail?.includes("@") ? ownEmail.split("@")[1].toLowerCase() : "";
  const mailbox = domain ? [...(e.to || []), ...(e.cc || [])].find((a) => typeof a === "string" && a.toLowerCase().endsWith(domain)) : undefined;
  return {
    id: e.id,
    kind: "received",
    who: e.from,
    whoSeed: e.from,
    subject: e.subject,
    snippet: "",
    date: e.created_at,
    hasAttachments: files.length > 0,
    files,
    unread: !f?.read,
    ...flagState(f),
    scheduled: false,
    canceled: false,
    deliveredTo: mailbox && !mailbox.toLowerCase().includes(ownEmail.toLowerCase()) ? mailbox : undefined,
  };
}

export function fromSent(e: SentEmail, flags: Flags): Item {
  const toList = Array.isArray(e?.to) ? e.to : typeof e?.to === "string" ? [e.to] : [];
  return {
    id: e.id,
    kind: "sent",
    who: toList.length ? `To: ${toList.join(", ")}` : "To: (unknown)",
    whoSeed: toList[0] ?? "",
    subject: e.subject || "(no subject)",
    snippet: stripHtml(e.html || e.text || "").slice(0, 140),
    date: e.sentAt || new Date().toISOString(),
    hasAttachments: (e.attachments ?? []).length > 0,
    unread: false,
    ...flagState(flags?.[e.id]),
    scheduled: isScheduled(e),
    canceled: !!e.canceled,
  };
}

export function fromDraft(d: Draft): Item {
  return {
    id: d.id,
    kind: "draft",
    who: d.to.length ? `To: ${d.to.join(", ")}` : "No recipients",
    whoSeed: d.to[0] ?? "draft",
    subject: d.subject,
    snippet: stripHtml(d.html).slice(0, 140),
    date: d.savedAt,
    hasAttachments: false,
    unread: false,
    starred: false,
    important: false,
    hidden: false,
    scheduled: false,
    canceled: false,
  };
}

/** Rebuild a row from the metadata saved when it was starred/flagged (it may not be in a loaded page). */
export function fromMeta(id: string, m: ItemMeta, f: Flag): Item {
  return {
    id,
    kind: m.kind,
    who: m.kind === "sent" ? `To: ${m.to.join(", ")}` : m.from,
    whoSeed: m.kind === "sent" ? m.to[0] ?? "" : m.from,
    subject: m.subject,
    snippet: "",
    date: m.date,
    hasAttachments: m.hasAttachments,
    unread: m.kind === "received" && !f.read,
    ...flagState(f),
    scheduled: false,
    canceled: false,
  };
}

export function metaOf(item: Item, to: string[]): ItemMeta {
  return {
    kind: item.kind === "draft" ? "sent" : item.kind,
    from: item.who,
    to,
    subject: item.subject,
    date: item.date,
    hasAttachments: item.hasAttachments,
  };
}

export const byDateDesc = (a: Item, b: Item) => +new Date(b.date) - +new Date(a.date);
