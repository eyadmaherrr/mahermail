import { addressedTo } from "@/lib/config";
import { getReceived } from "@/lib/mailCache";
import { authed } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/inbox/[id]">) => {
  const { id } = await ctx.params;
  try {
    const email = await getReceived(id);
    // Ensure only the mailbox it was sent to can read it
    if (!addressedTo(email, user.email)) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }
    return Response.json(email, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
});
