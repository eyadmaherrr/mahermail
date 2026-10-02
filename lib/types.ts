export type Field = "to" | "cc" | "bcc";

export type Recipients = Record<Field, string[]>;

export type SentEmail = Recipients & {
  id: string;
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; size: number }[];
  scheduledAt: string | null;
  canceled?: boolean;
  sentAt: string;
};

export type Draft = Recipients & {
  id: string;
  subject: string;
  html: string;
  savedAt: string;
};

/** A received email as it appears in a list (Resend's list endpoint has no body). */
export type InboxItem = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  created_at: string;
  /** actual envelope recipients — includes Bcc'd mailboxes that don't appear in to/cc */
  received_for?: string[];
  attachments: { id: string; filename: string | null; size: number; content_disposition: string | null }[];
};

export type InboxPage = { data: InboxItem[]; hasMore: boolean; next: string | null };

export type RemoteAttachment = {
  kind: "received" | "sent";
  emailId: string;
  id: string;
  filename: string;
  size: number;
  contentType?: string;
};

export type ReceivedEmail = InboxItem & {
  html: string | null;
  text: string | null;
  reply_to: string[];
  message_id: string;
};

/** Enough to render a starred/important row even if the message isn't in a loaded page. */
export type ItemMeta = {
  kind: "received" | "sent";
  from: string;
  to: string[];
  subject: string;
  date: string;
  hasAttachments: boolean;
};

export type Flag = { starred?: boolean; important?: boolean; read?: boolean; hidden?: boolean; meta?: ItemMeta };
export type Flags = Record<string, Flag>;

/** What the compose window is opened with: a draft, reply, forward, or undone send. */
export type ComposeSeed = Partial<Recipients> & {
  id?: string;
  subject?: string;
  html?: string;
  files?: File[];
  remote?: RemoteAttachment[];
  inReplyTo?: string;
};

export type SendMeta = Recipients & {
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  scheduledAt?: string | null;
  inReplyTo?: string;
  remote?: RemoteAttachment[];
};

export type Settings = {
  // account
  fromName: string;
  replyTo: string;
  signature: string;
  // inbox
  refreshSeconds: number;
  notifyNewMail: boolean;
  markReadOnOpen: boolean;
  blockRemoteImages: boolean;
  // compose
  undoSeconds: number;
  confirmNoSubject: boolean;
  font: string;
  fontSize: number;
  // appearance
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  reduceTransparency: boolean;
  sidebarCollapsed: boolean;
  shortcuts: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  fromName: "",
  replyTo: "",
  signature: "",
  refreshSeconds: 60,
  notifyNewMail: false,
  markReadOnOpen: true,
  blockRemoteImages: true,
  undoSeconds: 5,
  confirmNoSubject: true,
  font: "Arial, sans-serif",
  fontSize: 14,
  theme: "system",
  density: "comfortable",
  reduceTransparency: false,
  sidebarCollapsed: false,
  shortcuts: true,
};

export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024; // Resend's cap per email
