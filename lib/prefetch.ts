// Browser-side message cache. Hovering a row starts loading it, so by the time it's
// clicked the body is usually already here; a hover and a click share the same request.
import { api } from "./client";
import type { ReceivedEmail } from "./types";

const bodies = new Map<string, Promise<ReceivedEmail>>();
const ready = new Map<string, ReceivedEmail>();

export function loadReceived(id: string): Promise<ReceivedEmail> {
  let p = bodies.get(id);
  if (!p) {
    p = api<ReceivedEmail>("GET", `/api/inbox/${encodeURIComponent(id)}`)
      .then((e) => { ready.set(id, e); return e; })
      .catch((e) => { bodies.delete(id); throw e; }); // let the next attempt retry
    bodies.set(id, p);
  }
  return p;
}

/** Synchronous peek, so an already-loaded message renders on the first frame with no skeleton. */
export const peekReceived = (id: string) => ready.get(id) ?? null;

/** Warm the cache for a row the user is about to open. */
export function prefetch(item: { id: string; kind: string }) {
  if (item.kind === "received") loadReceived(item.id).catch(() => {});
}
