import { promises as fs } from "fs";
import path from "path";

/**
 * Gravatar photo for an email hash (SHA-256 of the trimmed, lowercased address).
 * Proxied so the API key stays on the server, and cached on disk for a day so each
 * address is looked up at most once a day. 404 = no photo → the UI keeps the initials.
 */
const DIR = path.join(process.cwd(), "data", "cache", "avatars");
const TTL = 24 * 60 * 60 * 1000;
const HASH = /^[a-f0-9]{64}$/;
const inflight = new Map<string, Promise<Avatar | null>>();

type Avatar = { type: string; body: Buffer };

export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[hash]">) {
  const { hash } = await ctx.params;
  if (!HASH.test(hash)) return new Response(null, { status: 400 });

  let p = inflight.get(hash);
  if (!p) {
    p = resolve(hash).finally(() => inflight.delete(hash));
    inflight.set(hash, p);
  }
  const avatar = await p;
  const cache = { "Cache-Control": "private, max-age=86400" };
  if (!avatar) return new Response(null, { status: 404, headers: cache });
  return new Response(new Uint8Array(avatar.body), { headers: { ...cache, "Content-Type": avatar.type } });
}

async function resolve(hash: string): Promise<Avatar | null> {
  const meta = path.join(DIR, `${hash}.json`);
  try {
    const m = JSON.parse(await fs.readFile(meta, "utf8")) as { at: number; type: string | null };
    if (Date.now() - m.at < TTL) {
      return m.type ? { type: m.type, body: await fs.readFile(path.join(DIR, `${hash}.img`)) } : null;
    }
  } catch {
    // not cached yet
  }

  const avatar = await fromGravatar(hash).catch(() => undefined);
  if (avatar === undefined) return null; // network trouble: don't cache, try again next time
  await fs.mkdir(DIR, { recursive: true });
  if (avatar) await fs.writeFile(path.join(DIR, `${hash}.img`), avatar.body);
  await fs.writeFile(meta, JSON.stringify({ at: Date.now(), type: avatar?.type ?? null }));
  return avatar;
}

async function fromGravatar(hash: string): Promise<Avatar | null> {
  const key = process.env.GRAVATAR_API_KEY;
  let base = `https://gravatar.com/avatar/${hash}`;
  if (key) {
    // the keyed REST API gives the canonical avatar URL (and higher rate limits)
    const res = await fetch(`https://api.gravatar.com/v3/profiles/${hash}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const profile = (await res.json()) as { avatar_url?: string };
      if (profile.avatar_url) base = profile.avatar_url;
    }
  }
  // d=404: if the address has no photo, say so instead of returning a generic placeholder
  const img = await fetch(`${base}?s=160&d=404`, { signal: AbortSignal.timeout(5000) });
  if (img.status === 404) return null;
  if (!img.ok) throw new Error(`Gravatar ${img.status}`);
  return { type: img.headers.get("content-type") ?? "image/jpeg", body: Buffer.from(await img.arrayBuffer()) };
}
