// Received emails never change, so once fetched they're kept in memory and on disk
// (data/cache) — reopening a message, even after a restart, needs no call to Resend.
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { resend, withRetry } from "./config";
import type { ReceivedEmail } from "./types";

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production";
const DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, "cache", "received")
  : (isServerless ? path.join(os.tmpdir(), "maher-mailer", "cache", "received") : path.join(process.cwd(), "data", "cache", "received"));
const SEED_DIR = path.join(process.cwd(), "data", "cache", "received");

const memory = new Map<string, ReceivedEmail>();
const inflight = new Map<string, Promise<ReceivedEmail>>();
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export async function getReceived(id: string): Promise<ReceivedEmail> {
  if (!SAFE_ID.test(id)) throw new Error("Invalid message id");
  const hit = memory.get(id);
  if (hit) return hit;
  // two requests for the same message (hover prefetch + open) share one fetch
  let p = inflight.get(id);
  if (!p) {
    p = load(id).finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

async function load(id: string): Promise<ReceivedEmail> {
  const file = path.join(DIR, `${id}.json`);
  try {
    const email = JSON.parse(await fs.readFile(file, "utf8")) as ReceivedEmail;
    memory.set(id, email);
    return email;
  } catch {
    if (DIR !== SEED_DIR) {
      try {
        const email = JSON.parse(await fs.readFile(path.join(SEED_DIR, `${id}.json`), "utf8")) as ReceivedEmail;
        memory.set(id, email);
        return email;
      } catch {}
    }
  }

  const { data, error } = await withRetry(() => resend().emails.receiving.get(id));
  if (error || !data) throw new Error(error?.message ?? "Message not found");
  const email: ReceivedEmail = {
    id: data.id,
    from: data.from || "",
    to: data.to ?? [],
    cc: data.cc ?? [],
    subject: data.subject || "",
    created_at: data.created_at || new Date().toISOString(),
    received_for: data.received_for ?? [],
    html: data.html,
    text: data.text,
    reply_to: data.reply_to ?? [],
    message_id: data.message_id,
    attachments: (data.attachments ?? []).map((a) => ({
      id: a.id, filename: a.filename, size: a.size, content_disposition: a.content_disposition,
    })),
  };
  memory.set(id, email);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(email));
  } catch {
    // ignore disk cache failure on read-only environments
  }
  return email;
}
