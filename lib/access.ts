import type { Account } from "./accounts";
import { addressedTo, addressOf, resend } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Checks sent-DB ownership or received-mail recipient. */
export async function canAccess(user: Account, kind: "received" | "sent", emailId: string) {
  if (kind === "sent") {
    // Check local sent DB first
    if (await userDb(user).sent.has(emailId)) return true;
    // Fallback (e.g. sent before this server's storage was reset): it must have been sent *from* this mailbox
    try {
      const { data } = await resend().emails.get(emailId);
      if (data && addressOf(data.from) === addressOf(user.email)) return true;
    } catch { /* not found or API error */ }
    return false;
  }
  // kind === "received": check if the email was addressed to this mailbox
  try {
    return addressedTo(await getReceived(emailId), user.email);
  } catch {
    return false; // unknown or invalid id
  }
}
