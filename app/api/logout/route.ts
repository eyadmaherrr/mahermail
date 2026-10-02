import { endSession } from "@/lib/session";

export async function POST() {
  await endSession();
  // wipe anything this mailbox left in the browser's cache before someone else signs in
  return Response.json({ ok: true }, { headers: { "Clear-Site-Data": '"cache"' } });
}
