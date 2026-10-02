import { addressedTo, resend, withRetry } from "@/lib/config";
import { authed } from "@/lib/session";
import type { InboxItem, InboxPage } from "@/lib/types";

const PAGE = 50;
const WANT = 25;     // the domain's mail is shared, so keep paging until this mailbox has this many
const MAX_PAGES = 6; // …but never walk the whole history in one request

// Pages after the first only get older, so cache them; only the newest page is fetched on every refresh.
type RawPage = { rows: InboxItem[]; hasMore: boolean; last?: string };
const olderPages = new Map<string, { at: number; page: RawPage }>();
const OLDER_TTL = 10 * 60_000;

async function fetchPage(after?: string): Promise<RawPage> {
  const hit = after ? olderPages.get(after) : undefined;
  if (hit && Date.now() - hit.at < OLDER_TTL) return hit.page;
  const { data, error } = await withRetry(() =>
    resend().emails.receiving.list(after ? { limit: PAGE, after } : { limit: PAGE }),
  );
  if (error || !data) throw new Error(error?.message ?? "Couldn't load inbox");
  const list = Array.isArray(data.data) ? data.data : [];
  const page: RawPage = {
    rows: list.map((e) => ({
      id: e.id,
      from: e.from || "",
      to: Array.isArray(e.to) ? e.to : [],
      cc: Array.isArray(e.cc) ? e.cc : [],
      subject: e.subject || "",
      created_at: e.created_at || new Date().toISOString(),
      received_for: Array.isArray(e.received_for) ? e.received_for : undefined,
      attachments: (e.attachments ?? []).map((a) => ({
        id: a.id, filename: a.filename, size: a.size, content_disposition: a.content_disposition,
      })),
    })),
    hasMore: !!data.has_more && list.length > 0,
    last: list.at(-1)?.id,
  };
  if (after) olderPages.set(after, { at: Date.now(), page });
  return page;
}

/** Each signed-in mailbox only ever sees mail addressed to it. */
export const GET = authed(async (request, user) => {
  let after = new URL(request.url).searchParams.get("after") || undefined;

  const out: InboxItem[] = [];
  let hasMore = true;
  try {
    for (let i = 0; i < MAX_PAGES && hasMore; i++) {
      const page = await fetchPage(after);
      out.push(...page.rows.filter((e) => addressedTo(e, user.email)));
      hasMore = page.hasMore && !!page.last && page.rows.length > 0;
      after = page.last;
      if (out.length >= WANT || !hasMore) break;
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }

  const page: InboxPage = { data: out, hasMore, next: hasMore ? after ?? null : null };
  return Response.json(page);
});
