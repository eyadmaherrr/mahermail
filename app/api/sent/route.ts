import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { SentEmail } from "@/lib/types";

export const GET = authed(async (_req, user) => {
  const local = await userDb(user).sent.list();
  if (local.length > 0) return Response.json(local);

  try {
    const { data } = await resend().emails.list();
    if (data?.data && Array.isArray(data.data)) {
      const fromResend = data.data
        .filter((e) => e.from && e.from.toLowerCase().includes(user.email.toLowerCase()))
        .map((e) => ({
          id: e.id,
          to: Array.isArray(e.to) ? e.to : [e.to],
          cc: [],
          bcc: [],
          subject: e.subject || "(no subject)",
          html: "",
          text: "",
          attachments: [],
          scheduledAt: null,
          sentAt: e.created_at || new Date().toISOString(),
        } as SentEmail));
      if (fromResend.length > 0) return Response.json(fromResend);
    }
  } catch {
    // Ignore fallback failure
  }
  return Response.json(local);
});
