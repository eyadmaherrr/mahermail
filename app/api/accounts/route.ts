import { ACCOUNTS } from "@/lib/accounts";
import { getAccountPassword } from "@/lib/session";

/** The mailboxes shown on the app's sign-in screen (no secrets — just who can sign in). */
export async function GET() {
  return Response.json(ACCOUNTS.map((a) => ({ ...a, enabled: !!getAccountPassword(a.id) })));
}
