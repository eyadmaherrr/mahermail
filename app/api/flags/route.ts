import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import type { Flag } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = authed(async (_req, user) => Response.json(await userDb(user).flags.all()));

/**
 * { id, ...Flag } updates one message; { readIds: [...] } marks many as read;
 * { items: [{ id, ...Flag }] } applies a bulk action to a selection.
 */
export const PATCH = authed(async (request, user) => {
  const body = (await request.json()) as ({ id: string } & Flag) | { readIds: string[] } | { items: ({ id: string } & Flag)[] };
  const { flags } = userDb(user);
  if ("readIds" in body) return Response.json(await flags.markRead(body.readIds));
  if ("items" in body) return Response.json(await flags.patchMany(body.items.filter((i) => typeof i.id === "string")));
  const { id, ...patch } = body;
  return Response.json(await flags.patch(id, patch));
});
