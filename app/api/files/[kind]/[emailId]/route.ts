import { canAccess } from "@/lib/access";
import { attachmentUrl } from "@/lib/attachments";
import { authed } from "@/lib/session";

/**
 * Opens an attachment: resolves a fresh signed URL from Resend at click time and redirects to it,
 * so links on screen never expire. `?id=` for received mail, `?name=` for sent mail.
 */
export const GET = authed(async (request, user, ctx: RouteContext<"/api/files/[kind]/[emailId]">) => {
  const { kind, emailId } = await ctx.params;
  if (kind !== "received" && kind !== "sent") return new Response("Not found", { status: 404 });
  if (!(await canAccess(user, kind, emailId))) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? undefined;
  const name = params.get("name") ?? undefined;
  if (!id && !name) return new Response("Missing id or name", { status: 400 });
  try {
    const { url } = await attachmentUrl(kind, emailId, { id, name });
    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(`Couldn’t open this attachment: ${(e as Error).message}. Please try again.`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
