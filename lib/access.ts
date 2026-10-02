import type { Account } from "./accounts";
import { addressedTo, resend } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Received mail must be addressed to it; sent mail must be its own. */
export async function canAccess(user: Account, kind: "received" | "sent", emailId: string) {
  if (kind === "sent") {
    if (await userDb(user).sent.has(emailId)) return true;
    try {
      const { data } = await resend().emails.get(emailId);
      if (data?.from && data.from.toLowerCase().includes(user.email.toLowerCase())) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
  try {
    return addressedTo(await getReceived(emailId), user.email);
  } catch {
    return false;
  }
}
