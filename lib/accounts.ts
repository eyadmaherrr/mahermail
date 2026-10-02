// The mailboxes that can sign in. Passwords live in .env as <ID>_PASSWORD (e.g. MAHER_PASSWORD).
export type Account = { id: string; email: string; name: string };

const DOMAIN = "drmahermahmoud.com";

export const ACCOUNTS: Account[] = [
  { id: "eyad", email: `eyad@${DOMAIN}`, name: "Eyad" },
  { id: "maher", email: `maher@${DOMAIN}`, name: "Dr. Maher Mahmoud" },
  { id: "heba", email: `heba@${DOMAIN}`, name: "Heba" },
  { id: "anas", email: `anas@${DOMAIN}`, name: "Anas" },
];

export const findAccount = (id: string | undefined) => ACCOUNTS.find((a) => a.id === id) ?? null;
