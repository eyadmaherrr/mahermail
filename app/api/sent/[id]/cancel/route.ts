import { canAccess } from "@/lib/access";
import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Cancel a scheduled email before it goes out. */
export const POST = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]/cancel">) => {
  const { id } = await ctx.params;
  // Privacy check: only the sender may cancel their scheduled email
  if (!(await canAccess(user, "sent", id))) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }
  const { sent } = userDb(user);
  const { error } = await resend().emails.cancel(id);
  if (error) return Response.json({ error: error.message }, { status: 502 });
  try {
    await sent.update(id, { canceled: true });
  } catch {}
  return Response.json({ ok: true });
});
