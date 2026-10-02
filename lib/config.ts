import { Resend } from "resend";

let client: Resend | null = null;

export function resend() {
  if (!process.env.RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY in .env");
  return (client ??= new Resend(process.env.RESEND_API_KEY));
}

type ResendResult = { error: { name: string; statusCode: number | null } | null };

/** Resend rate-limits bursts (a few requests/second) — back off briefly and retry instead of failing. */
export async function withRetry<T extends ResendResult>(call: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const res = await call();
    const limited = res.error?.name === "rate_limit_exceeded" || res.error?.statusCode === 429;
    if (!limited || i === tries - 1) return res;
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error("unreachable");
}

/** Whether a message was addressed to this mailbox (to / cc / envelope recipients). */
export function addressedTo(email: { to?: string[]; cc?: string[]; received_for?: string[] }, address: string) {
  if (!address) return false;
  const a = address.toLowerCase();
  const to = Array.isArray(email.to) ? email.to : [];
  const cc = Array.isArray(email.cc) ? email.cc : [];
  const rf = Array.isArray(email.received_for) ? email.received_for : [];
  return [...to, ...cc, ...rf].some((x) => typeof x === "string" && x.toLowerCase().includes(a));
}
