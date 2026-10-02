import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { SentEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  const list = await userDb(user).sent.list();
  const local = list.find((e) => e.id === id);

  try {
    const { data } = await resend().emails.get(id);
    if (data) {
      // Privacy check: only the sender mailbox may access this sent email
      if (data.from && !data.from.toLowerCase().includes(user.email.toLowerCase())) {
        return Response.json({ error: "Message not found" }, { status: 404 });
      }

      // Fetch attachments from Resend if not present locally
      let attachments = local?.attachments || [];
      if (!attachments.length) {
        try {
          const attRes = await resend().emails.attachments.list({ emailId: id });
          if (attRes.data?.data && Array.isArray(attRes.data.data)) {
            attachments = attRes.data.data.map((a) => ({
              id: a.id,
              filename: a.filename || "attachment",
              size: a.size || 0,
            }));
          }
        } catch (attErr) {
          console.warn("[sent/[id]] Could not list attachments:", (attErr as Error).message);
        }
      }

      const email: SentEmail = {
        id: data.id,
        to: Array.isArray(data.to) ? data.to : typeof data.to === "string" ? [data.to] : [],
        cc: Array.isArray(data.cc) ? data.cc : typeof data.cc === "string" ? [data.cc] : [],
        bcc: Array.isArray(data.bcc) ? data.bcc : typeof data.bcc === "string" ? [data.bcc] : [],
        subject: data.subject || "(no subject)",
        html: data.html || (data.text ? `<pre>${data.text}</pre>` : ""),
        text: data.text || "",
        attachments,
        scheduledAt: data.scheduled_at ?? null,
        sentAt: data.created_at || new Date().toISOString(),
      };

      // Cache locally
      try {
        await userDb(user).sent.upsert(email);
      } catch {}

      return Response.json(email);
    }
  } catch (err) {
    console.warn("[sent/[id]] Could not get email details from Resend:", (err as Error).message);
  }

  if (local) return Response.json(local);
  return Response.json({ error: "Email not found" }, { status: 404 });
});

export const DELETE = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  await userDb(user).sent.remove(id);
  return Response.json({ ok: true });
});
