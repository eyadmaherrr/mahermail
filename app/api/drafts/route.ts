import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user) => Response.json(await userDb(user).drafts.list()));

export const POST = authed(async (request, user) => {
  const body = (await request.json()) as Partial<Draft>;
  const draft: Draft = {
    id: body.id || Date.now().toString(36),
    to: body.to ?? [],
    cc: body.cc ?? [],
    bcc: body.bcc ?? [],
    subject: body.subject ?? "",
    html: body.html ?? "",
    savedAt: new Date().toISOString(),
  };
  await userDb(user).drafts.upsert(draft);
  return Response.json({ id: draft.id });
});
