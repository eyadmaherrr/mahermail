import type { Account } from "./accounts";
import { addressedTo, resend } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Received mail must be addressed to it; sent mail must be its own. */
export async function canAccess(user: Account, kind: "received" | "sent", emailId: string): Promise<boolean> {
  if (kind === "sent") {
    if (await userDb(user).sent.has(emailId)) return true;
    try {
      const { data } = await resend().emails.get(emailId);
      return !!(data?.from && data.from.toLowerCase().includes(user.email.toLowerCase()));
    } catch {
      return false;
    }
  }

  try {
    const email = await getReceived(emailId);
    return addressedTo(email, user.email);
  } catch {
    return false;
  }
}
