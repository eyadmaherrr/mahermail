import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";

export const DELETE = authed(async (_req, user, ctx: RouteContext<"/api/sent/[id]">) => {
  const { id } = await ctx.params;
  await userDb(user).sent.remove(id);
  return Response.json({ ok: true });
});
