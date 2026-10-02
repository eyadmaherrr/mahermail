import { endSession } from "@/lib/session";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
