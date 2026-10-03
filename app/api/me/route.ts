import { authed } from "@/lib/session";

/** Who this token/cookie belongs to — the app calls it at launch to check its saved sign-in. */
export const GET = authed(async (_req, user) => Response.json({ account: user }));
