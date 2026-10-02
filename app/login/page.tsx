import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { ACCOUNTS } from "@/lib/accounts";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in — Maher Mail" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  // only mailboxes with a password configured in .env can sign in
  const accounts = ACCOUNTS.map((a) => ({
    ...a,
    enabled: !!process.env[`${a.id.toUpperCase()}_PASSWORD`],
  }));
  return <LoginForm accounts={accounts} />;
}
