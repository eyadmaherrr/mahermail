import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { SentEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user) => {
  const local = await userDb(user).sent.list();
  const userEmail = user.email.trim().toLowerCase();

  // Fetch sent messages from Resend belonging ONLY to this user's email address
  let remoteEmails: SentEmail[] = [];
  try {
    const { data } = await resend().emails.list({ limit: 100 });
    if (data?.data && Array.isArray(data.data)) {
      remoteEmails = data.data
        .filter((e) => e.from && e.from.toLowerCase().includes(userEmail))
        .map((e) => ({
          id: e.id,
          to: Array.isArray(e.to) ? e.to : typeof e.to === "string" ? [e.to] : [],
          cc: Array.isArray(e.cc) ? e.cc : typeof e.cc === "string" ? [e.cc] : [],
          bcc: Array.isArray(e.bcc) ? e.bcc : typeof e.bcc === "string" ? [e.bcc] : [],
          subject: e.subject || "(no subject)",
          html: "",
          text: "",
          attachments: [],
          scheduledAt: e.scheduled_at ?? null,
          sentAt: e.created_at || new Date().toISOString(),
        }));
    }
  } catch (err) {
    console.warn("[sent] Could not fetch remote sent emails:", (err as Error).message);
  }

  // Merge local and remote: local takes precedence because it includes attachments and full body
  const localMap = new Map(local.map((item) => [item.id, item]));
  const merged: SentEmail[] = [...local];
  for (const remote of remoteEmails) {
    if (!localMap.has(remote.id)) {
      merged.push(remote);
    }
  }

  // Sort newest first
  merged.sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));

  return Response.json(merged);
});
