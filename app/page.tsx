import { redirect } from "next/navigation";
import MailApp from "@/components/MailApp";
import { userDb } from "@/lib/db";
import { currentUser } from "@/lib/session";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  // settings are read on the server so theme/density are right on first paint (no flash)
  return <MailApp account={user} initialSettings={await userDb(user).settings.get()} />;
}
