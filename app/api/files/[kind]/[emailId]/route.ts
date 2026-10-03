import { canAccess } from "@/lib/access";
import { attachmentUrl } from "@/lib/attachments";
import { authed } from "@/lib/session";

/**
 * Opens an attachment. `?id=` (or `?name=` for older sent mail) picks the file.
 *
 * - Default: resolves a fresh signed URL from Resend at click time and redirects to it,
 *   so links on screen never expire.
 * - `&raw=1`: streams the bytes through this server for the in-app previewer. They're always
 *   served as an opaque download (octet-stream, nosniff, sandboxed) — never as a page on this
 *   origin — so an untrusted HTML/SVG attachment can't run script as the app. The previewer
 *   decides how to show the bytes itself.
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
    if (params.get("raw") !== "1") return Response.redirect(url, 302);

    const upstream = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok || !upstream.body) throw new Error(`download failed (${upstream.status})`);
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    };
    const length = upstream.headers.get("content-length");
    if (length) headers["Content-Length"] = length; // lets the previewer show download progress
    return new Response(upstream.body, { headers });
  } catch (e) {
    return new Response(`Couldn’t open this attachment: ${(e as Error).message}. Please try again.`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
