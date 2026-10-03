import { canAccess } from "@/lib/access";
import { resend } from "@/lib/config";
import { authed } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/status/[id]">) => {
  const { id } = await ctx.params;
  if (!(await canAccess(user, "sent", id))) return Response.json({ error: "Email not found" }, { status: 404 });
  try {
    const { data, error } = await resend().emails.get(id);
    if (error || !data) return Response.json({ error: error?.message ?? "Unavailable" }, { status: 502 });
    return Response.json({ status: data.last_event ?? "sent" });
  } catch (err) {
    return Response.json({ status: "sent" });
  }
});
