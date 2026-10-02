import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { SentEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  const list = await userDb(user).sent.list();
  const local = list.find((e) => e.id === id);
  if (local && (local.html || local.text)) return Response.json(local);

  try {
    const { data } = await resend().emails.get(id);
    if (data) {
      const email: SentEmail = {
        id: data.id,
        to: Array.isArray(data.to) ? data.to : typeof data.to === "string" ? [data.to] : [],
        cc: Array.isArray(data.cc) ? data.cc : typeof data.cc === "string" ? [data.cc] : [],
        bcc: Array.isArray(data.bcc) ? data.bcc : typeof data.bcc === "string" ? [data.bcc] : [],
        subject: data.subject || "(no subject)",
        html: data.html || (data.text ? `<pre>${data.text}</pre>` : ""),
        text: data.text || "",
        attachments: local?.attachments || [],
        scheduledAt: data.scheduled_at ?? null,
        sentAt: data.created_at || new Date().toISOString(),
      };
      // Cache locally if possible
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
