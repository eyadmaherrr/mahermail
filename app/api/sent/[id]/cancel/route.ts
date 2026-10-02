import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";

/** Cancel a scheduled email before it goes out. */
export const POST = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]/cancel">) => {
  const { id } = await ctx.params;
  const { sent } = userDb(user);
  if (!(await sent.has(id))) return Response.json({ error: "Message not found" }, { status: 404 });
  const { error } = await resend().emails.cancel(id);
  if (error) return Response.json({ error: error.message }, { status: 502 });
  await sent.update(id, { canceled: true });
  return Response.json({ ok: true });
});
