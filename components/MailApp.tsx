"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar";
import Compose, { type Outgoing } from "./Compose";
import Icon from "./Icon";
import MessageList, { VIEW_META, type SelectionAction } from "./MessageList";
import Reader, { type ReaderActions } from "./Reader";
import SettingsSheet from "./SettingsSheet";
import { api, fmtDate, parseAddress, prefs } from "@/lib/client";
import type { Account } from "@/lib/accounts";
import { peekReceived, prefetch } from "@/lib/prefetch";
import { byDateDesc, fromDraft, fromMeta, fromReceived, fromSent, metaOf, type Item, type View } from "@/lib/items";
import { DEFAULT_SETTINGS, type ComposeSeed, type Flag, type Draft, type Flags, type InboxItem, type InboxPage, type SentEmail, type Settings } from "@/lib/types";

const CONTACTS_ID = "contacts";
type Toast = { text: string; action?: { label: string; run: () => void }; on: boolean };

export default function MailApp({ account, initialSettings }: { account: Account; initialSettings: Settings }) {
  const ownEmail = account.email;
  const FLAGS_KEY = `mm_flags_${account.id}`;
  const SETTINGS_KEY = `mm_settings_${account.id}`;
  const DRAFTS_KEY = `mm_drafts_${account.id}`;
  const VIEW_KEY = `mm_view_${account.id}`;
  const LAST_OPENED_KEY = `mm_last_opened_${account.id}`;
  const DELETED_DRAFTS_KEY = `mm_drafts_deleted_${account.id}`;

  // The first render must match the server's HTML exactly, so it uses only server data.
  // What this browser remembers (localStorage) is applied right after mount — see below.
  // Merge over defaults so settings added in newer versions always start defined.
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...initialSettings }));
  const [view, setView] = useState<View>("inbox");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // the message you just read stays highlighted in the list after going back
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxNext, setInboxNext] = useState<string | null>(null);
  const [inboxState, setInboxState] = useState<{ loading: boolean; more: boolean; error: string | null }>({ loading: true, more: false, error: null });
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [flags, setFlags] = useState<Flags>({});
  const [localLoaded, setLocalLoaded] = useState(false);

  // Restore what this browser remembers, once, after the first (server-matching) render.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const deleted = new Set(prefs.get<string[]>(DELETED_DRAFTS_KEY, []));
    const savedSettings = prefs.get<Partial<Settings> | null>(SETTINGS_KEY, null);
    if (savedSettings) setSettings((s) => ({ ...s, ...savedSettings }));
    setView(prefs.get<View>(VIEW_KEY, "inbox"));
    setLastOpenedId(prefs.get<string | null>(LAST_OPENED_KEY, null));
    // merge with anything the server already sent back, rather than overwriting it
    setDrafts((curr) => {
      const byId = new Map(prefs.get<Draft[]>(DRAFTS_KEY, []).map((d) => [d.id, d]));
      for (const d of curr) byId.set(d.id, d);
      return [...byId.values()].filter((d) => !deleted.has(d.id));
    });
    setFlags((curr) => ({ ...prefs.get<Flags>(FLAGS_KEY, {}), ...curr }));
    setRestored(true);
    // keys are fixed for this signed-in account
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep localStorage synced as a resilient client-side copy — but only after restoring,
  // so the empty first-render state never overwrites what was saved.
  useEffect(() => { if (restored) prefs.set(FLAGS_KEY, flags); }, [restored, flags, FLAGS_KEY]);
  useEffect(() => { if (restored) prefs.set(SETTINGS_KEY, settings); }, [restored, settings, SETTINGS_KEY]);
  useEffect(() => { if (restored) prefs.set(DRAFTS_KEY, drafts); }, [restored, drafts, DRAFTS_KEY]);
  useEffect(() => { if (restored) prefs.set(VIEW_KEY, view); }, [restored, view, VIEW_KEY]);
  useEffect(() => {
    if (restored && lastOpenedId) prefs.set(LAST_OPENED_KEY, lastOpenedId);
  }, [restored, lastOpenedId, LAST_OPENED_KEY]);

  /**
   * Forget drafts that were discarded or sent. The ids are remembered so a copy still sitting in
   * this browser (or a server delete that failed) can't bring them back on the next refresh.
   */
  const forgetDrafts = useCallback((ids: (string | undefined)[]) => {
    const list = ids.filter((id): id is string => !!id);
    if (!list.length) return;
    const gone = new Set([...prefs.get<string[]>(DELETED_DRAFTS_KEY, []), ...list]);
    prefs.set(DELETED_DRAFTS_KEY, [...gone].slice(-500));
    setDrafts((curr) => curr.filter((d) => !gone.has(d.id)));
  }, [DELETED_DRAFTS_KEY]);

  const [compose, setCompose] = useState<{ key: number; seed: ComposeSeed } | null>(null);
  const [toast, setToast] = useState<Toast>({ text: "", on: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // every send still inside its undo window (there can be more than one)
  const pendingSends = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seenIds = useRef<Set<string> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const readerActions = useRef<ReaderActions | null>(null);

  /* ---------------- toast ---------------- */
  const notify = useCallback((text: string, action?: Toast["action"], ms = 5000) => {
    setToast({ text, action, on: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), ms);
  }, []);
  const showToast = useCallback((text: string) => notify(text), [notify]);

  /* ---------------- settings ---------------- */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      prefs.set(SETTINGS_KEY, next);
      return next;
    });
    api<Settings>("PUT", "/api/settings", patch).catch((e) => notify(`Couldn’t save settings: ${(e as Error).message}`));
  }, [notify, SETTINGS_KEY]);

  /* ---------------- data ---------------- */
  const loadLocal = useCallback(async () => {
    try {
      const [s, d, f] = await Promise.all([
        api<SentEmail[]>("GET", "/api/sent"),
        api<Draft[]>("GET", "/api/drafts"),
        api<Flags>("GET", "/api/flags"),
      ]);
      setSent(s);
      setDrafts((curr) => {
        const deleted = new Set(prefs.get<string[]>(DELETED_DRAFTS_KEY, []));
        const byId = new Map(curr.map((x) => [x.id, x]));
        for (const draft of d) byId.set(draft.id, draft);
        return [...byId.values()].filter((x) => !deleted.has(x.id));
      });
      setFlags((curr) => {
        // Merge server flags with local flags so no client-side hidden/read state is ever lost
        const merged = { ...curr, ...f };
        prefs.set(FLAGS_KEY, merged);
        return merged;
      });
    } catch (e) {
      notify(`Couldn’t load your mail: ${(e as Error).message}`);
    } finally {
      setLocalLoaded(true);
    }
  }, [notify, DELETED_DRAFTS_KEY, FLAGS_KEY]);

  /** Fetch the newest page. On refresh, merge in anything new and announce it. */
  const loadInbox = useCallback(async (reset: boolean) => {
    if (reset) setInboxState({ loading: true, more: false, error: null });
    try {
      const page = await api<InboxPage>("GET", "/api/inbox");
      const fresh = seenIds.current ? page.data.filter((e) => !seenIds.current!.has(e.id)) : [];
      seenIds.current ??= new Set();
      page.data.forEach((e) => seenIds.current!.add(e.id));

      if (reset) {
        setInbox(page.data);
        setInboxNext(page.next);
      } else if (fresh.length) {
        setInbox((cur) => [...fresh, ...cur.filter((c) => !fresh.some((f) => f.id === c.id))]);
      }
      setInboxState({ loading: false, more: false, error: null });

      if (!reset && fresh.length) {
        const first = fresh[0];
        notify(fresh.length === 1 ? `New message from ${parseAddress(first.from).name}` : `${fresh.length} new messages`, {
          label: "View",
          run: () => { setView("inbox"); setSelectedId(first.id); },
        });
        if (settings.notifyNewMail && "Notification" in window && Notification.permission === "granted") {
          const n = new Notification(parseAddress(first.from).name, {
            body: fresh.length === 1 ? first.subject : `${first.subject} and ${fresh.length - 1} more`,
            icon: "/logo.png",
            tag: "maher-mail",
          });
          n.onclick = () => { window.focus(); setView("inbox"); setSelectedId(first.id); };
        }
      }
    } catch (e) {
      setInboxState({ loading: false, more: false, error: (e as Error).message });
    }
  }, [settings.notifyNewMail, notify]);

  const loadOlder = async () => {
    if (!inboxNext) return;
    setInboxState((s) => ({ ...s, more: true }));
    try {
      const page = await api<InboxPage>("GET", `/api/inbox?after=${encodeURIComponent(inboxNext)}`);
      page.data.forEach((e) => seenIds.current?.add(e.id));
      setInbox((cur) => [...cur, ...page.data.filter((e) => !cur.some((c) => c.id === e.id))]);
      setInboxNext(page.next);
    } catch (e) {
      notify(`Couldn’t load older mail: ${(e as Error).message}`);
    } finally {
      setInboxState((s) => ({ ...s, more: false }));
    }
  };

  useEffect(() => { loadLocal(); }, [loadLocal]);

  useEffect(() => {
    loadInbox(true);
    // first load only; refreshes come from the interval / focus below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // background checking + check when the window regains focus
  useEffect(() => {
    const onFocus = () => loadInbox(false);
    window.addEventListener("focus", onFocus);
    const t = settings.refreshSeconds > 0 ? setInterval(() => loadInbox(false), settings.refreshSeconds * 1000) : undefined;
    return () => { window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, [settings.refreshSeconds, loadInbox]);

  /* ---------------- derived lists ---------------- */
  const sentById = useMemo(() => new Map(sent.map((s) => [s.id, s])), [sent]);
  const receivedItems = useMemo(() => inbox.map((e) => fromReceived(e, flags, ownEmail)), [inbox, flags, ownEmail]);
  const sentItems = useMemo(() => sent.filter((e) => !flags[e.id]?.removed).map((e) => fromSent(e, flags)), [sent, flags]);
  const unread = receivedItems.filter((i) => i.unread && !i.hidden).length;

  // hidden mail only appears in the Hidden section
  const flagged = useCallback((key: "starred" | "important" | "hidden") => {
    const known = new Map([...receivedItems, ...sentItems].map((i) => [i.id, i]));
    return Object.entries(flags)
      .filter(([, f]) => f[key] && !f.removed && (key === "hidden" || !f.hidden))
      .map(([id, f]) => known.get(id) ?? (f.meta ? fromMeta(id, f.meta, f) : null))
      .filter((i): i is Item => !!i)
      .sort(byDateDesc);
  }, [flags, receivedItems, sentItems]);

  const items = useMemo(() => {
    const base: Item[] =
      view === "inbox" ? receivedItems.filter((i) => !i.hidden) :
      view === "sent" ? sentItems.filter((i) => !i.hidden) :
      view === "scheduled" ? sentItems.filter((i) => i.scheduled && !i.hidden) :
      view === "drafts" ? drafts.map(fromDraft) :
      flagged(view);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => `${i.who} ${i.subject} ${i.snippet} ${i.deliveredTo ?? ""}`.toLowerCase().includes(q));
  }, [view, receivedItems, sentItems, drafts, flagged, query]);

  const counts = {
    inbox: unread,
    starred: Object.values(flags).filter((f) => f.starred && !f.hidden && !f.removed).length,
    important: Object.values(flags).filter((f) => f.important && !f.hidden && !f.removed).length,
    sent: sentItems.filter((i) => !i.hidden).length,
    scheduled: sentItems.filter((i) => i.scheduled && !i.hidden).length,
    drafts: drafts.length,
    hidden: Object.values(flags).filter((f) => f.hidden && !f.removed).length,
  };

  const selected = items.find((i) => i.id === selectedId) ?? [...receivedItems, ...sentItems].find((i) => i.id === selectedId) ?? null;

  const selectedIndex = selected ? items.findIndex((i) => i.id === selected.id) : -1;
  const step = (d: number) => {
    const next = items[selectedIndex + d];
    if (next && next.kind !== "draft") open(next);
  };

  // while reading, warm up the messages either side so J/K and the arrows are instant
  useEffect(() => {
    if (selectedIndex < 0) return;
    [items[selectedIndex + 1], items[selectedIndex - 1]].forEach((i) => i && prefetch(i));
  }, [selectedIndex, items]);

  // after the inbox loads, quietly fetch the newest unread messages one at a time
  // (gently — Resend rate-limits bursts, and these are cached on disk afterwards)
  useEffect(() => {
    const queue = receivedItems.filter((i) => i.unread && !peekReceived(i.id)).slice(0, 4);
    if (!queue.length) return;
    let cancelled = false;
    const t = setTimeout(async function run() {
      for (const item of queue) {
        if (cancelled) return;
        prefetch(item);
        await new Promise((r) => setTimeout(r, 700));
      }
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
    // only when the set of loaded messages changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox]);

  useEffect(() => {
    document.title = unread ? `Inbox (${unread}) — Maher Mail` : "Maher Mail";
  }, [unread]);

  /* ---------------- actions ---------------- */
  const patchFlag = useCallback(async (item: Item, patch: Flags[string]) => {
    const to = item.kind === "sent" ? sentById.get(item.id)?.to ?? [] : [];
    const body = { id: item.id, ...patch, meta: metaOf(item, to) };
    setFlags((f) => {
      const next = { ...f, [item.id]: { ...f[item.id], ...body } };
      prefs.set(FLAGS_KEY, next);
      return next;
    }); // optimistic + instant localStorage save
    try {
      const serverFlags = await api<Flags>("PATCH", "/api/flags", body);
      setFlags((f) => {
        const merged = { ...f, ...serverFlags };
        prefs.set(FLAGS_KEY, merged);
        return merged;
      });
    } catch (e) {
      notify(`Couldn’t update: ${(e as Error).message}`);
      loadLocal();
    }
  }, [sentById, notify, loadLocal, FLAGS_KEY]);

  const toggle = (item: Item, key: "starred" | "important") => {
    const on = !item[key];
    patchFlag(item, { [key]: on });
    if (key === "important") notify(on ? "Marked as important" : "Marked as not important");
  };

  const open = (item: Item) => {
    if (item.kind === "draft") {
      const d = drafts.find((x) => x.id === item.id);
      if (d) setCompose({ key: Date.now(), seed: d });
      return;
    }
    setSelectedId(item.id);
    setLastOpenedId(item.id);
    prefs.set(LAST_OPENED_KEY, item.id);
    if (item.unread && settings.markReadOnOpen) patchFlag(item, { read: true });
  };

  const markAllRead = async () => {
    const ids = receivedItems.filter((i) => i.unread && !i.hidden).map((i) => i.id);
    setFlags((f) => {
      const next = Object.fromEntries([...Object.entries(f), ...ids.map((id) => [id, { ...f[id], read: true }])]);
      prefs.set(FLAGS_KEY, next);
      return next;
    });
    try {
      const serverFlags = await api<Flags>("PATCH", "/api/flags", { readIds: ids });
      setFlags((f) => {
        const merged = { ...f, ...serverFlags };
        prefs.set(FLAGS_KEY, merged);
        return merged;
      });
    } catch {
      loadLocal();
    }
    notify(`Marked ${ids.length} as read`);
  };

  /* ---------------- selection & bulk actions ---------------- */
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null); // last row picked, for shift-click ranges

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setPicked(new Set());
    anchor.current = null;
  }, []);

  // a new view or search starts with nothing selected
  useEffect(() => { exitSelect(); }, [view, query, exitSelect]);

  // forget picks that left the list (e.g. after hiding them)
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const pick = (item: Item, range: boolean) => {
    setSelectMode(true);
    // read the anchor now: the state updater below may run after it's been moved to this item
    const a = anchor.current ? items.findIndex((i) => i.id === anchor.current) : -1;
    const b = items.findIndex((i) => i.id === item.id);
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let k = lo; k <= hi; k++) next.add(items[k].id);
      } else if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    anchor.current = item.id;
  };

  const pickedItems = items.filter((i) => picked.has(i.id));
  const allPicked = items.length > 0 && pickedItems.length === items.length;

  const patchMany = async (list: Item[], patch: Flag) => {
    if (!list.length) return;
    const body = {
      items: list.map((i) => ({ id: i.id, ...patch, meta: metaOf(i, i.kind === "sent" ? sentById.get(i.id)?.to ?? [] : []) })),
    };
    setFlags((f) => {
      const next = { ...f };
      for (const { id, ...rest } of body.items) next[id] = { ...next[id], ...rest };
      prefs.set(FLAGS_KEY, next);
      return next;
    });
    try {
      const serverFlags = await api<Flags>("PATCH", "/api/flags", body);
      setFlags((f) => {
        const merged = { ...f, ...serverFlags };
        prefs.set(FLAGS_KEY, merged);
        return merged;
      });
    } catch (e) {
      notify(`Couldn’t update: ${(e as Error).message}`);
      loadLocal();
    }
  };

  /** Hide (or bring back) messages. Nothing is deleted — they move to the Hidden section. */
  const setHidden = (list: Item[], hidden: boolean) => {
    if (!list.length) return;
    patchMany(list, { hidden });
    exitSelect();
    if (selectedId && list.some((i) => i.id === selectedId)) setSelectedId(null);
    const n = list.length === 1 ? "Message" : `${list.length} messages`;
    notify(hidden ? `${n} hidden` : `${n} moved back`, {
      label: "Undo",
      run: () => { patchMany(list, { hidden: !hidden }); notify("Undone"); },
    });
  };

  const discardDrafts = async (list: Item[]) => {
    if (!confirm(`Discard ${list.length === 1 ? "this draft" : `${list.length} drafts`}? This can’t be undone.`)) return;
    await Promise.all(list.map((d) => api("DELETE", `/api/drafts/${encodeURIComponent(d.id)}`).catch(() => {})));
    forgetDrafts(list.map((d) => d.id));
    exitSelect();
    loadLocal();
    notify(list.length === 1 ? "Draft discarded" : `${list.length} drafts discarded`);
  };

  const bulkActions = (): SelectionAction[] => {
    if (view === "drafts") return [{ key: "discard", label: "Discard", icon: "trash", danger: true, run: () => discardDrafts(pickedItems) }];
    const received = pickedItems.filter((i) => i.kind === "received");
    const allStarred = pickedItems.every((i) => i.starred);
    const allImportant = pickedItems.every((i) => i.important);
    const actions: SelectionAction[] = [
      view === "hidden"
        ? { key: "unhide", label: "Unhide", icon: "show", run: () => setHidden(pickedItems, false) }
        : { key: "hide", label: "Hide", icon: "hide", run: () => setHidden(pickedItems, true) },
    ];
    if (received.length) {
      actions.push(received.some((i) => i.unread)
        ? { key: "read", label: "Mark read", icon: "doneAll", run: () => patchMany(received, { read: true }) }
        : { key: "unread", label: "Mark unread", icon: "mail", run: () => patchMany(received, { read: false }) });
    }
    actions.push(
      { key: "star", label: allStarred ? "Unstar" : "Star", icon: allStarred ? "star" : "starFill", run: () => patchMany(pickedItems, { starred: !allStarred }) },
      { key: "important", label: allImportant ? "Not important" : "Important", icon: allImportant ? "important" : "importantFill", run: () => patchMany(pickedItems, { important: !allImportant }) },
    );
    return actions;
  };

  const signOut = async () => {
    const waiting = pendingSends.current.size;
    if (waiting && !confirm(`${waiting === 1 ? "A message is" : `${waiting} messages are`} still waiting to send. Sign out anyway? ${waiting === 1 ? "It" : "They"} won’t be sent.`)) return;
    pendingSends.current.forEach(clearTimeout);
    pendingSends.current.clear();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/login");
  };

  const go = (v: View) => { setView(v); setSelectedId(null); setSidebarOpen(false); };

  const signatureHtml = settings.signature ? `<div class="signature">--<br>${settings.signature}</div>` : "";
  const openCompose = (seed: ComposeSeed = {}) => setCompose({ key: Date.now(), seed });

  /** Send with an undo window: the message only leaves after the delay. */
  const dispatch = (out: Outgoing) => {
    setCompose(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = async () => {
      if (timer) pendingSends.current.delete(timer);
      notify(out.meta.scheduledAt ? "Scheduling…" : "Sending…", undefined, 30000);
      const form = new FormData();
      form.append("meta", JSON.stringify(out.meta));
      out.files.forEach((f) => form.append("attachments", f));
      try {
        const { id } = await api<{ id: string }>("POST", "/api/send", form);
        if (out.draftId) {
          await api("DELETE", `/api/drafts/${encodeURIComponent(out.draftId)}`).catch(() => {});
          forgetDrafts([out.draftId]);
        }
        await loadLocal();
        notify(out.meta.scheduledAt ? `Scheduled for ${fmtDate(out.meta.scheduledAt, true)}` : "Message sent", {
          label: "View",
          run: () => { setView(out.meta.scheduledAt ? "scheduled" : "sent"); setSelectedId(id); },
        });
      } catch (e) {
        notify(`Couldn’t send: ${(e as Error).message}`, undefined, 8000);
        setCompose({ key: Date.now(), seed: out.seed });
      }
    };
    if (settings.undoSeconds > 0) {
      const t = setTimeout(fire, settings.undoSeconds * 1000);
      timer = t;
      pendingSends.current.add(t);
      notify(out.meta.scheduledAt ? "Scheduling…" : "Sending…", {
        label: "Undo",
        run: () => {
          clearTimeout(t);
          pendingSends.current.delete(t);
          setCompose({ key: Date.now(), seed: out.seed });
          notify("Sending undone");
        },
      }, settings.undoSeconds * 1000);
    } else fire();
  };

  // don't lose a message that's waiting out its undo window
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (pendingSends.current.size) e.preventDefault(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  /* ---------------- keyboard shortcuts ---------------- */
  // the listener is attached once, so it reads current state *and* current handlers through this ref
  const keyState = useRef({ items, selected, compose, settingsOpen, settings, selectMode, go, open, toggle, patchFlag, openCompose, updateSettings, exitSelect });
  keyState.current = { items, selected, compose, settingsOpen, settings, selectMode, go, open, toggle, patchFlag, openCompose, updateSettings, exitSelect };
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      const s = keyState.current;
      if (!s.settings.shortcuts || s.settingsOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        if (e.key === "Escape" && t === searchRef.current) { setQuery(""); t.blur(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (Date.now() - gPressed < 1200) {
        gPressed = 0;
        if (k === "i") return s.go("inbox");
        if (k === "s") return s.go("sent");
        if (k === "t") return s.go("starred");
      }
      const idx = s.selected ? s.items.findIndex((i) => i.id === s.selected!.id) : -1;
      const step = (d: number) => {
        const next = s.items[Math.min(s.items.length - 1, Math.max(0, idx + d))];
        if (next && next.kind !== "draft") s.open(next);
      };
      switch (k) {
        case "c": e.preventDefault(); if (!s.compose) s.openCompose(); break;
        case "/": e.preventDefault(); searchRef.current?.focus(); break;
        case "g": gPressed = Date.now(); break;
        case "[": s.updateSettings({ sidebarCollapsed: !s.settings.sidebarCollapsed }); break;
        case "j": step(1); break;
        case "k": step(-1); break;
        case "s": if (s.selected) s.toggle(s.selected, "starred"); break;
        case "i": if (s.selected) s.toggle(s.selected, "important"); break;
        case "u": if (s.selected?.kind === "received") { s.patchFlag(s.selected, { read: false }); setSelectedId(null); } break;
        case "r": readerActions.current?.reply(); break;
        case "a": readerActions.current?.replyAll(); break;
        case "f": readerActions.current?.forward(); break;
        case "escape":
          if (s.selectMode) s.exitSelect();
          else { setSelectedId(null); setSidebarOpen(false); }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handlers read fresh state through keyState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contacts = useMemo(() => {
    const set = new Set<string>();
    sent.forEach((e) => [...(e.to || []), ...(e.cc || []), ...(e.bcc || [])].forEach((a) => a && set.add(a)));
    inbox.forEach((e) => {
      const em = parseAddress(e.from).email;
      if (em) set.add(em);
    });
    return [...set];
  }, [sent, inbox]);

  const listLoading = view === "inbox" ? inboxState.loading : !localLoaded;
  readerActions.current = selected ? readerActions.current : null;

  /* ---------------- render ---------------- */
  const collapsed = settings.sidebarCollapsed;
  const navItem = (v: View, extra?: string) => (
    <button
      key={v}
      className={`nav-item${view === v ? " active" : ""}`}
      onClick={() => go(v)}
      aria-current={view === v ? "page" : undefined}
      title={collapsed ? `${VIEW_META[v].title}${counts[v] ? ` (${counts[v]})` : ""}` : undefined}
    >
      <span className={extra}><Icon name={VIEW_META[v].icon} /></span>
      <span className="label">{VIEW_META[v].title}</span>
      {counts[v] > 0 && <span className={`count${v === "inbox" ? " unread" : ""}`}>{counts[v]}</span>}
    </button>
  );

  return (
    <div
      className="root"
      data-theme={settings.theme === "system" ? undefined : settings.theme}
      data-density={settings.density}
      data-transparency={settings.reduceTransparency ? "reduced" : undefined}
      data-sidebar={collapsed ? "collapsed" : undefined}
    >
      <div className="shell">
        {sidebarOpen && <div className="scrim" style={{ zIndex: 39 }} onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar glass-thick${sidebarOpen ? " open" : ""}`}>
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" />
            <div className="label"><b>Mail</b><small>Dr. Maher Mahmoud</small></div>
            <button
              className="icon-btn sm collapse-btn"
              title={collapsed ? "Expand sidebar ( [ )" : "Collapse sidebar ( [ )"}
              aria-expanded={!collapsed}
              onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}
            >
              <Icon name={collapsed ? "sidebarOpen" : "sidebarClose"} />
            </button>
          </div>
          <button className="btn primary compose-btn" title={collapsed ? "Compose (C)" : undefined} onClick={() => { openCompose(); setSidebarOpen(false); }}>
            <Icon name="pen" /><span className="label">Compose</span>
          </button>
          <nav className="nav" aria-label="Mailboxes">
            <div className="nav-label">Mailboxes</div>
            {navItem("inbox")}
            {navItem("sent")}
            <div className="nav-label">Tags</div>
            {navItem("starred", "icon-star")}
            {navItem("important", "icon-important")}
            <div className="nav-label">More</div>
            {navItem("scheduled")}
            {navItem("drafts")}
            {navItem("hidden")}
          </nav>
          <div className="sidebar-foot">
            <button className="nav-item" title={collapsed ? "Settings" : undefined} onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }}>
              <Icon name="gear" /><span className="label">Settings</span>
            </button>
            <button className="nav-item" title={collapsed ? "Sign out" : undefined} onClick={signOut}>
              <Icon name="logout" /><span className="label">Sign out</span>
            </button>
            <div className="who-card glass-thin" title={collapsed ? `${settings.fromName} <${ownEmail}>` : undefined}>
              <Avatar seed={`${settings.fromName} <${ownEmail}>`} />
              <div className="lines label"><b>{settings.fromName}</b><small>{ownEmail}</small></div>
            </div>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <button className="icon-btn menu-btn glass-thin" title="Mailboxes" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
            <label className="search glass">
              <Icon name="search" />
              <input
                ref={searchRef}
                placeholder={`Search ${VIEW_META[view].title.toLowerCase()}`}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
              />
              {query ? (
                <button className="icon-btn sm" title="Clear search" onClick={() => setQuery("")}><Icon name="x" /></button>
              ) : settings.shortcuts ? <kbd>/</kbd> : null}
            </label>
            <span className="spacer" />
            <div className="capsule glass">
              <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><Icon name="gear" /></button>
            </div>
          </div>

          <div className="content">
            <MessageList
              view={view}
              items={items}
              selectedId={selectedId ?? lastOpenedId}
              loading={listLoading}
              error={view === "inbox" ? inboxState.error : null}
              query={query.trim()}
              unread={unread}
              hasMore={view === "inbox" && !!inboxNext}
              loadingMore={inboxState.more}
              onOpen={open}
              onToggle={toggle}
              onRefresh={() => (view === "inbox" ? loadInbox(inbox.length === 0) : loadLocal())}
              onMarkAllRead={markAllRead}
              onLoadMore={loadOlder}
              onHover={prefetch}
              hidden={!!selected}
              selection={{
                active: selectMode,
                picked,
                allPicked,
                onPick: pick,
                onToggleAll: () => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id))),
                onStart: () => setSelectMode(true),
                onExit: exitSelect,
                actions: bulkActions(),
              }}
            />
            {selected && (
              <Reader
                key={selected.id}
                item={selected}
                sentRecord={sentById.get(selected.id)}
                ownEmail={ownEmail}
                ownName={settings.fromName}
                signatureHtml={signatureHtml}
                blockImages={settings.blockRemoteImages}
                actionsRef={readerActions}
                position={selectedIndex >= 0 ? { index: selectedIndex, total: items.length } : null}
                onPrev={() => step(-1)}
                onNext={() => step(1)}
                onBack={() => setSelectedId(null)}
                onToggle={(k) => toggle(selected, k)}
                onHide={() => setHidden([selected], !selected.hidden)}
                onMarkUnread={() => { patchFlag(selected, { read: false }); setSelectedId(null); notify("Marked as unread"); }}
                onCompose={(seed) => openCompose(seed)}
                onDelete={async () => {
                  const id = selected.id;
                  // remembered as a flag so Resend's copy of the message doesn't bring it back
                  setFlags((f) => ({ ...f, [id]: { ...f[id], removed: true } }));
                  setSelectedId(null);
                  try {
                    await api("DELETE", `/api/sent/${encodeURIComponent(id)}`);
                    notify("Removed from your Sent list");
                  } catch (e) {
                    notify(`Couldn’t remove: ${(e as Error).message}`);
                  }
                  loadLocal();
                }}
                onCancelScheduled={async () => {
                  if (!confirm("Cancel this scheduled message? It won’t be sent.")) return;
                  try {
                    await api("POST", `/api/sent/${encodeURIComponent(selected.id)}/cancel`);
                    await loadLocal();
                    notify("Scheduled send canceled");
                  } catch (e) {
                    notify(`Couldn’t cancel: ${(e as Error).message}`);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {compose && (
        <Compose
          key={compose.key}
          seed={compose.seed}
          initialHtml={compose.seed.html ?? (signatureHtml ? `<br><br>${signatureHtml}` : "")}
          settings={settings}
          ownEmail={ownEmail}
          contactsId={CONTACTS_ID}
          toast={showToast}
          onClose={(changed, info) => {
            setCompose(null);
            if (info?.discardedId) forgetDrafts([info.discardedId]);
            if (info?.unsaved) {
              const draft = info.unsaved;
              setDrafts((curr) => [draft, ...curr.filter((d) => d.id !== draft.id)]);
              notify("Couldn’t reach the server — draft kept on this device");
            }
            if (changed) loadLocal();
          }}
          onSend={dispatch}
        />
      )}

      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        ownEmail={ownEmail}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        onSignOut={signOut}
      />

      <datalist id={CONTACTS_ID}>
        {contacts.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className={`toast${toast.on ? " on" : ""}`} role="status" aria-live="polite">
        <span>{toast.text}</span>
        {toast.action && (
          <button className="act" onClick={() => { toast.action!.run(); if (toast.action!.label !== "Undo") setToast((t) => ({ ...t, on: false })); }}>
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
