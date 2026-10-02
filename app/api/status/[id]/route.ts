import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/status/[id]">) => {
  const { id } = await ctx.params;
  if (!(await userDb(user).sent.has(id))) return Response.json({ error: "Message not found" }, { status: 404 });
  const { data, error } = await resend().emails.get(id);
  if (error || !data) return Response.json({ error: error?.message ?? "Unavailable" }, { status: 502 });
  return Response.json({ status: data.last_event ?? "unknown" });
});
