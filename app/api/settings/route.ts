import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types";

export const GET = authed(async (_req, user) => Response.json(await userDb(user).settings.get()));

export const PUT = authed(async (request, user) => {
  const body = (await request.json()) as Partial<Settings>;
  // only accept known keys
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => k in DEFAULT_SETTINGS));
  return Response.json(await userDb(user).settings.set(patch));
});
