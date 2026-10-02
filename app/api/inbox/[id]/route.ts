import { addressedTo } from "@/lib/config";
import { getReceived } from "@/lib/mailCache";
import { authed } from "@/lib/session";

export const GET = authed(async (_req, user, ctx: RouteContext<"/api/inbox/[id]">) => {
  const { id } = await ctx.params;
  try {
    const email = await getReceived(id);
    // only the mailbox it was sent to may read it
    if (!addressedTo(email, user.email)) return Response.json({ error: "Message not found" }, { status: 404 });
    // Never let the browser cache it: on a shared computer the next person to sign in must not
    // be served this mailbox's mail. Speed comes from the server's own memory/disk cache instead.
    return Response.json(email, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
});
