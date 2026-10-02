import type { Account } from "./accounts";
import { addressedTo } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Received mail must be addressed to it; sent mail must be its own. */
export async function canAccess(user: Account, kind: "received" | "sent", emailId: string) {
  if (kind === "sent") return userDb(user).sent.has(emailId);
  try {
    return addressedTo(await getReceived(emailId), user.email);
  } catch {
    return false;
  }
}
