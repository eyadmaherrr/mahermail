import { canAccess } from "@/lib/access";
import { listFiles } from "@/lib/attachments";
import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { SentEmail } from "@/lib/types";

export const dynamic = "force-dynamic";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * One sent email with its body and the files that were attached. Messages that came from
 * Resend's list (not sent through this app) are filled in from Resend the first time they're
 * opened — body and attachment list — and saved, so it only happens once.
 */
export const GET = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  const db = userDb(user);
  const local = (await db.sent.list()).find((e) => e.id === id);
  // only the mailbox that sent it may read it
  if (!local && !(await canAccess(user, "sent", id))) {
    return Response.json({ error: "Email not found" }, { status: 404 });
  }

  let email: SentEmail | undefined = local;
  let changed = false;

  if (!email || (!email.html && !email.text)) {
    try {
      const { data } = await resend().emails.get(id);
      if (data) {
        const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);
        email = {
          id: data.id,
          to: list(data.to),
          cc: list(data.cc),
          bcc: list(data.bcc),
          subject: data.subject || "(no subject)",
          html: data.html || (data.text ? `<pre>${escapeHtml(data.text)}</pre>` : ""),
          text: data.text || "",
          attachments: local?.attachments ?? [],
          attachmentsChecked: local?.attachmentsChecked,
          scheduledAt: data.scheduled_at ?? null,
          sentAt: data.created_at || new Date().toISOString(),
        };
        changed = true;
      }
    } catch (err) {
      console.warn("[sent/[id]] Could not get email details from Resend:", (err as Error).message);
    }
  }
  if (!email) return Response.json({ error: "Email not found" }, { status: 404 });

  if (!email.attachmentsChecked) {
    try {
      const files = await listFiles("sent", id);
      email = { ...email, attachments: files.map(({ id, filename, size }) => ({ id, filename, size })), attachmentsChecked: true };
      changed = true;
    } catch (err) {
      // Resend's attachment endpoint is sometimes slow/flaky — leave it unchecked and try again next open
      console.warn("[sent/[id]] Could not list attachments:", (err as Error).message);
    }
  }

  if (changed) await db.sent.upsert(email).catch(() => {});
  return Response.json(email);
});

/**
 * Remove from the Sent list. The list also merges in Resend's own record of sent mail, so the
 * removal is remembered as a flag — otherwise the message would reappear on the next refresh.
 */
export const DELETE = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  const db = userDb(user);
  await db.sent.remove(id);
  return Response.json(await db.flags.patch(id, { removed: true }));
});
