import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";

export const GET = authed(async (_req, user) => Response.json(await userDb(user).sent.list()));
