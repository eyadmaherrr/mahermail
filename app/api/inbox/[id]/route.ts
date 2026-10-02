import { getReceived } from "@/lib/mailCache";
import { authed } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, _user, ctx: RouteContext<"/api/inbox/[id]">) => {
  const { id } = await ctx.params;
  try {
    const email = await getReceived(id);
    // Auto-approve: any authenticated mailbox can read incoming messages
    return Response.json(email, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
});
