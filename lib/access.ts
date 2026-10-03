import type { Account } from "./accounts";
import { addressedTo } from "./config";
import { userDb } from "./db";
import { getReceived } from "./mailCache";

/** Can this mailbox see this message? Checks sent-DB ownership or received-mail recipient. */
export async function canAccess(user: Account, kind: "received" | "sent", emailId: string) {
  if (kind === "sent") {
    // Check local sent DB first
    if (await userDb(user).sent.has(emailId)) return true;
    // Fallback: check the Resend email's from address
    try {
      const { resend } = await import("./config");
      const { data } = await resend().emails.get(emailId);
      if (data && data.from && data.from.toLowerCase().includes(user.email.toLowerCase())) return true;
    } catch { /* not found or API error */ }
    return false;
  }
  // kind === "received": check if the email was addressed to this mailbox
  const email = await getReceived(emailId);
  if (!email) return false;
  return addressedTo(email, user.email);
}
