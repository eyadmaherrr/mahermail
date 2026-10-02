"use client";

import { useLayoutEffect, useRef } from "react";
import Avatar from "./Avatar";
import Icon, { type IconName } from "./Icon";
import { fmtDate, parseAddress } from "@/lib/client";
import type { Item, View } from "@/lib/items";

export const VIEW_META: Record<View, { title: string; icon: IconName; empty: string }> = {
  inbox: { title: "Inbox", icon: "inbox", empty: "No mail here yet. New messages to your address will show up automatically." },
  starred: { title: "Starred", icon: "star", empty: "Star messages to keep them close. Press S or tap the star on any message." },
  important: { title: "Important", icon: "important", empty: "Mark messages as important to collect them here." },
  sent: { title: "Sent", icon: "send", empty: "Nothing sent yet. Write your first message with Compose." },
  scheduled: { title: "Scheduled", icon: "clock", empty: "Messages you schedule for later wait here until they go out." },
  drafts: { title: "Drafts", icon: "draft", empty: "Closing a message you haven't sent saves it here." },
  hidden: { title: "Hidden", icon: "hide", empty: "Select messages and choose Hide to tuck them away here. Nothing is deleted." },
};

export type SelectionAction = { key: string; label: string; icon: IconName; run: () => void; danger?: boolean };

export type Selection = {
  /** selection mode is on (rows toggle instead of opening) */
  active: boolean;
  picked: Set<string>;
  allPicked: boolean;
  onPick: (item: Item, range: boolean) => void;
  onToggleAll: () => void;
  onStart: () => void;
  onExit: () => void;
  actions: SelectionAction[];
};

type Props = {
  view: View;
  items: Item[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  query: string;
  unread: number;
  hasMore: boolean;
  loadingMore: boolean;
  onOpen: (item: Item) => void;
  onToggle: (item: Item, flag: "starred" | "important") => void;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onLoadMore: () => void;
  /** start loading a message the pointer is resting on */
  onHover: (item: Item) => void;
  /** hidden while a message is open; stays mounted so the scroll position survives */
  hidden: boolean;
  selection: Selection;
};

export default function MessageList(p: Props) {
  const meta = VIEW_META[p.view];
  const sel = p.selection;
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  useLayoutEffect(() => {
    if (!p.hidden && listRef.current) listRef.current.scrollTop = scrollTop.current;
  }, [p.hidden]);

  const sub =
    p.view === "inbox" && p.unread ? `${p.unread} unread` :
    `${p.items.length}${p.hasMore ? "+" : ""} ${p.items.length === 1 ? "message" : "messages"}`;

  return (
    <section className="panel glass list-panel" aria-label={meta.title} hidden={p.hidden}>
      {sel.active ? (
        <div className="list-head select-head">
          <button
            className={`pick-all${sel.allPicked ? " on" : sel.picked.size ? " some" : ""}`}
            role="checkbox"
            aria-checked={sel.allPicked ? true : sel.picked.size ? "mixed" : false}
            title={sel.allPicked ? "Select none" : "Select all"}
            onClick={sel.onToggleAll}
          >
            <Icon name="check" />
          </button>
          <div className="titles">
            <h2>{sel.picked.size ? `${sel.picked.size} selected` : "Select messages"}</h2>
            <div className="sub">{sel.picked.size ? meta.title : "Tap messages to select them · Shift-click for a range"}</div>
          </div>
          {sel.picked.size > 0 && (
            <div className="sel-actions glass-thin" role="toolbar" aria-label="Selected messages">
              {sel.actions.map((a) => (
                <button key={a.key} className={`sel-act${a.danger ? " danger" : ""}`} title={a.label} onClick={a.run}>
                  <Icon name={a.icon} /><span>{a.label}</span>
                </button>
              ))}
            </div>
          )}
          <button className="btn primary sm" onClick={sel.onExit}>Done</button>
        </div>
      ) : (
        <div className="list-head">
          <div className="titles">
            <h2>{p.query ? "Search" : meta.title}</h2>
            <div className="sub">{p.query ? `Results for “${p.query}” · ${p.items.length}` : sub}</div>
          </div>
          {p.items.length > 0 && (
            <button className="btn ghost sm" title="Select messages" onClick={sel.onStart}><Icon name="select" />Select</button>
          )}
          {p.view === "inbox" && p.unread > 0 && (
            <button className="icon-btn" title="Mark all as read" onClick={p.onMarkAllRead}><Icon name="doneAll" /></button>
          )}
          <button className="icon-btn" title="Refresh (checks for new mail)" onClick={p.onRefresh}><Icon name="refresh" /></button>
        </div>
      )}

      {p.loading ? (
        <div className="list">{Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton" />)}</div>
      ) : p.error ? (
        <div className="empty">
          <div>
            <Icon name={meta.icon} />
            <b>Couldn’t load {meta.title.toLowerCase()}</b>
            <p>{p.error}</p>
            <button className="btn primary sm" onClick={p.onRefresh}>Try again</button>
          </div>
        </div>
      ) : p.items.length === 0 ? (
        <div className="empty">
          <div>
            <Icon name={p.query ? "search" : meta.icon} />
            <b>{p.query ? "No results" : `No ${meta.title.toLowerCase()} messages`}</b>
            <p style={{ maxWidth: 280, margin: "0 auto" }}>{p.query ? "Try a different name, address or subject." : meta.empty}</p>
          </div>
        </div>
      ) : (
        <div className="list list-fade" role="list" ref={listRef} onScroll={(e) => { scrollTop.current = e.currentTarget.scrollTop; }}>
          {p.items.map((item) => (
            <Row
              key={item.id}
              item={item}
              selected={item.id === p.selectedId}
              selectMode={sel.active}
              picked={sel.picked.has(item.id)}
              onPick={sel.onPick}
              onOpen={p.onOpen}
              onToggle={p.onToggle}
              onHover={p.onHover}
            />
          ))}
          {p.hasMore && !p.query && (
            <div className="load-more">
              <button className="btn ghost sm" disabled={p.loadingMore} onClick={p.onLoadMore}>
                {p.loadingMore ? "Loading…" : "Load older messages"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ item, selected, selectMode, picked, onPick, onOpen, onToggle, onHover }: {
  item: Item; selected: boolean; selectMode: boolean; picked: boolean;
  onPick: (i: Item, range: boolean) => void;
  onOpen: (i: Item) => void; onToggle: (i: Item, f: "starred" | "important") => void; onHover: (i: Item) => void;
}) {
  // a short dwell filters out the pointer just passing over rows on its way somewhere else
  const dwell = useRef<ReturnType<typeof setTimeout>>(undefined);
  const name = item.kind === "received" ? parseAddress(item.who).name : item.who;
  return (
    <div
      role="listitem"
      tabIndex={0}
      className={[
        "row",
        item.unread ? "unread" : item.kind === "received" ? "read" : "",
        item.starred && "starred",
        item.important && "important",
        selected && !selectMode && "selected",
        picked && "picked",
        selectMode && "selecting",
      ].filter(Boolean).join(" ")}
      onClick={(e) => (selectMode ? onPick(item, e.shiftKey) : onOpen(item))}
      onKeyDown={(e) => {
        if (e.key === "Enter") selectMode ? onPick(item, e.shiftKey) : onOpen(item);
        if (e.key === " " || e.key.toLowerCase() === "x") { e.preventDefault(); e.stopPropagation(); onPick(item, e.shiftKey); }
      }}
      onPointerEnter={() => { dwell.current = setTimeout(() => onHover(item), 120); }}
      onPointerLeave={() => clearTimeout(dwell.current)}
      onPointerDown={() => onHover(item) /* touch: start loading on press, before the click lands */}
      onFocus={() => onHover(item)}
      aria-current={selected || undefined}
    >
      {/* the avatar doubles as the selection checkbox, like Gmail */}
      <button
        className="lead"
        role="checkbox"
        aria-checked={picked}
        aria-label={`Select “${item.subject || "(no subject)"}”`}
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onPick(item, e.shiftKey); }}
      >
        <Avatar seed={item.whoSeed} />
        <span className="pick" aria-hidden><Icon name="check" /></span>
      </button>
      <div className="body">
        <div className="top">
          <span className="who" title={item.who}>{name}</span>
          {item.hasAttachments && <Icon name="clip" size={14} />}
          <span className="when">{fmtDate(item.date)}</span>
        </div>
        <div className="subject">{item.subject || "(no subject)"}</div>
        {item.snippet && <div className="snippet">{item.snippet}</div>}
        {(item.kind === "draft" || item.scheduled || item.canceled || item.deliveredTo || item.important || item.starred) && (
          <div className="tags">
            {item.important && <span className="tag important"><Icon name="importantFill" />Important</span>}
            {item.starred && <span className="tag starred"><Icon name="starFill" />Starred</span>}
            {item.kind === "draft" && <span className="tag draft">Draft</span>}
            {item.scheduled && <span className="tag scheduled"><Icon name="clock" />Scheduled</span>}
            {item.canceled && <span className="tag canceled">Canceled</span>}
            {item.deliveredTo && <span className="tag">{item.deliveredTo}</span>}
          </div>
        )}
      </div>
      {item.kind !== "draft" && (
        <div className="marks">
          <button
            className={`icon-btn sm${item.starred ? " on-star" : ""}`}
            title={item.starred ? "Unstar" : "Star"}
            aria-pressed={item.starred}
            onClick={(e) => { e.stopPropagation(); onToggle(item, "starred"); }}
          >
            <Icon name={item.starred ? "starFill" : "star"} />
          </button>
          <button
            className={`icon-btn sm${item.important ? " on-important" : ""}`}
            title={item.important ? "Mark not important" : "Mark important"}
            aria-pressed={item.important}
            onClick={(e) => { e.stopPropagation(); onToggle(item, "important"); }}
          >
            <Icon name={item.important ? "importantFill" : "important"} />
          </button>
        </div>
      )}
    </div>
  );
}
