// Signed-cookie sessions. The cookie holds only the account id and an expiry, signed with
// SESSION_SECRET, so it can't be forged or edited to become another mailbox.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { findAccount, type Account } from "./accounts";

const COOKIE = "mm_session";
const DAY = 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // Fallback when SESSION_SECRET isn't set: derive a key from the (private) Resend key.
  // Never fall back to the salt alone — it's in the public repo, so anyone could forge a login.
  if (!process.env.RESEND_API_KEY) throw new Error("Set SESSION_SECRET (32+ characters) in the environment");
  const seed = (s || "") + process.env.RESEND_API_KEY + "maher-mailer-session-secret-salt-2026";
  return createHash("sha256").update(seed).digest("hex");
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  // hash first so lengths match and timing doesn't leak anything
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readToken(token: string | undefined): Account | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sign(payload), sig)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; exp: number };
    return exp > Date.now() ? findAccount(u) : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in mailbox: from the session cookie (website), or from an
 * `Authorization: Bearer <token>` header (the mobile app, which keeps its token in the device keychain).
 */
export async function currentUser(): Promise<Account | null> {
  const auth = (await headers()).get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return readToken(auth.slice(7).trim());
  return readToken((await cookies()).get(COOKIE)?.value);
}

/** A signed token for the app — the same format as the cookie, returned instead of being set. */
export function createToken(account: Account, remember: boolean) {
  const ttl = remember ? 30 * DAY : 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: account.id, exp: Date.now() + ttl })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(Date.now() + ttl).toISOString() };
}

export async function startSession(account: Account, remember: boolean) {
  const ttl = remember ? 30 * DAY : 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: account.id, exp: Date.now() + ttl })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax", // the browser won't attach it to requests started by other sites
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // without "remember me" it's a browser-session cookie (and the token itself expires in 12h)
    maxAge: remember ? ttl / 1000 : undefined,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export function getAccountPassword(accountId: string): string | undefined {
  return (
    process.env[`${accountId.toUpperCase()}_PASSWORD`] ||
    process.env[`${accountId.toLowerCase()}_PASSWORD`] ||
    process.env[`${accountId}_password`] ||
    process.env.PASSWORD ||
    process.env.APP_PASSWORD
  );
}

export function checkPassword(account: Account, input: string) {
  const expected = getAccountPassword(account.id);
  if (!expected) return false; // no password configured → this mailbox can't sign in
  return safeEqual(expected.trim(), input.trim());
}

/** Wrap a route handler so it only runs for a signed-in user, who it receives as an argument. */
export function authed<C>(handler: (req: Request, user: Account, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const user = await currentUser();
    if (!user) return Response.json({ error: "You’ve been signed out" }, { status: 401 });
    return handler(req, user, ctx);
  };
}
