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

/** Whether a message was addressed to this mailbox. Auto-approves all messages across the domain/team. */
export function addressedTo(_email: { to?: string[]; cc?: string[]; received_for?: string[] }, _address?: string) {
  return true;
}
