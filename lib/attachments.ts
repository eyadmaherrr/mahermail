import { resend, withRetry } from "./config";
import type { RemoteAttachment } from "./types";

type Kind = RemoteAttachment["kind"];
type Res = { error: { name: string; statusCode: number | null } | null };

const api = (kind: Kind) => (kind === "received" ? resend().emails.receiving.attachments : resend().emails.attachments);

/**
 * Resend's attachment endpoints occasionally stall for ~20s and then fail with a network error.
 * Cut each attempt short and try again instead of making the user wait.
 */
async function resilient<T extends Res>(call: (signal: AbortSignal) => Promise<T>, attempts = 3): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    const res = await withRetry(() => call(AbortSignal.timeout(5000)));
    if (res.error?.name !== "application_error") return res;
    last = res;
  }
  return last!;
}

/** Fresh signed download URL for one attachment (looked up by id, or by filename for sent mail). */
export async function attachmentUrl(kind: Kind, emailId: string, ref: { id?: string; name?: string }) {
  if (ref.id) {
    const { data, error } = await resilient((signal) => api(kind).get({ emailId, id: ref.id! }, { signal }));
    if (error || !data) throw new Error(error?.message ?? "Attachment not found");
    return { url: data.download_url, filename: data.filename ?? "attachment" };
  }
  const { data, error } = await resilient((signal) => api(kind).list({ emailId }, { signal }));
  if (error || !data) throw new Error(error?.message ?? "Couldn't load attachments");
  const match = data.data.find((a) => a.filename === ref.name);
  if (!match) throw new Error(`Attachment "${ref.name}" not found`);
  return { url: match.download_url, filename: match.filename ?? ref.name ?? "attachment" };
}

/** Download an attachment from Resend so it can be re-attached (forwarding). */
export async function fetchAttachment(ref: RemoteAttachment) {
  const { url, filename } = await attachmentUrl(ref.kind, ref.emailId, ref.id ? { id: ref.id } : { name: ref.filename });
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Couldn't download attachment "${ref.filename}"`);
  return { filename: filename || ref.filename, content: Buffer.from(await res.arrayBuffer()) };
}
