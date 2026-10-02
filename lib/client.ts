// Browser-side helpers shared by the components.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const splitAddresses = (s: string) =>
  s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.replace("/login"); // session expired or signed out in another tab
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function fmtDate(iso: string | null | undefined, long = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (long) return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], {
    month: "short", day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export const escapeHtml = (s: string) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Parse `Name <a@b.com>` / `a@b.com` into parts. */
export function parseAddress(raw: string | undefined | null) {
  const str = (raw || "").trim();
  const m = str.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : str).trim();
  const name = (m?.[1] || "").trim() || email.split("@")[0] || email || "Unknown";
  return { name, email };
}

/** Stable brand-family hue per sender so avatars are recognisable at a glance. */
export function avatarColor(seed: string) {
  const palette = ["#176b9c", "#0b2d4d", "#2d9cdb", "#1a4a6e", "#3b7f8f", "#5a6fb0", "#7a5c9e", "#2f8f6f"];
  let h = 0;
  for (const c of seed || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function stripHtml(html: string | undefined | null) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const DROP_TAGS = "script,style,iframe,frame,object,embed,link,meta,base,form,input,button,select,textarea,title,head";

/**
 * Make untrusted (received) HTML safe to put inside our own page — e.g. quoting it in a reply.
 * Removes active content, event handlers and javascript: URLs.
 */
export function sanitizeHtml(html: string) {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(DROP_TAGS).forEach((el) => el.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction") el.removeAttribute(attr.name);
      else if (["href", "src", "xlink:href", "action"].includes(name) && /^(javascript|vbscript|data:text\/html)/.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

export const textToHtml = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");

export const isScheduled = (e: { scheduledAt?: string | null; canceled?: boolean }) =>
  !!e.scheduledAt && !e.canceled && new Date(e.scheduledAt) > new Date();

// localStorage can throw (private mode, blocked storage) — never let that break the app.
// Only for per-browser conveniences like the last-used mailbox.
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
