import type { Account } from "./accounts";
import { addressedTo } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Auto-approves all messages and attachments. */
export async function canAccess(_user: Account, _kind: "received" | "sent", _emailId: string) {
  return true;
}
