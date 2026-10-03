import { findAccount } from "@/lib/accounts";
import { checkPassword, createToken, startSession } from "@/lib/session";

// Slow down password guessing: after 5 wrong tries a mailbox is locked for a minute.
const MAX_TRIES = 5;
const LOCK_MS = 60_000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

export async function POST(request: Request) {
  const { account: id, password, remember, client } = (await request.json().catch(() => ({}))) as {
    account?: string; password?: string; remember?: boolean; client?: string;
  };
  const account = findAccount(id);
  if (!account || typeof password !== "string") {
    return Response.json({ error: "Choose an account and enter its password." }, { status: 400 });
  }

  const f = failures.get(account.id);
  if (f && f.lockedUntil > Date.now()) {
    const secs = Math.ceil((f.lockedUntil - Date.now()) / 1000);
    return Response.json({ error: `Too many attempts. Try again in ${secs} seconds.` }, { status: 429 });
  }

  if (!checkPassword(account, password)) {
    const count = (f && f.lockedUntil <= Date.now() && f.count >= MAX_TRIES ? 0 : f?.count ?? 0) + 1;
    failures.set(account.id, { count, lockedUntil: count >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
    const left = MAX_TRIES - count;
    return Response.json(
      { error: left > 0 ? "Incorrect password." : `Too many attempts. Try again in ${LOCK_MS / 1000} seconds.` },
      { status: 401 },
    );
  }

  failures.delete(account.id);
  // the mobile app gets a token to keep in the device keychain instead of a cookie
  if (client === "app") {
    return Response.json({ ok: true, account, ...createToken(account, remember !== false) });
  }
  await startSession(account, !!remember);
  // start the new session with a clean browser cache (nothing left over from the previous mailbox)
  return Response.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
}
