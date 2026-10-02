import { canAccess } from "@/lib/access";
import { fetchAttachment } from "@/lib/attachments";
import { resend } from "@/lib/config";
import { userDb } from "@/lib/db";
import { authed } from "@/lib/session";
import { MAX_ATTACHMENT_BYTES, type SendMeta } from "@/lib/types";

const clean = (list: unknown) =>
  (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean);

export const POST = authed(async (request, user) => {
  const form = await request.formData();
  const meta = JSON.parse(String(form.get("meta") ?? "{}")) as SendMeta;
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File);
  const remote = meta.remote ?? [];
  // forwarded attachments must come from mail this mailbox can actually see
  for (const r of remote) {
    if (!(await canAccess(user, r.kind, r.emailId))) {
      return Response.json({ error: `Can’t forward “${r.filename}”` }, { status: 403 });
    }
  }

  const to = clean(meta.to), cc = clean(meta.cc), bcc = clean(meta.bcc);
  if (!to.length) return Response.json({ error: "Add at least one recipient" }, { status: 400 });

  const total = files.reduce((n, f) => n + f.size, 0) + remote.reduce((n, r) => n + r.size, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    return Response.json({ error: "Attachments are limited to 40 MB total" }, { status: 413 });
  }

  let attachments;
  try {
    attachments = [
      ...(await Promise.all(files.map(async (f) => ({ filename: f.name, content: Buffer.from(await f.arrayBuffer()) })))),
      ...(await Promise.all(remote.map(fetchAttachment))), // forwarded originals
    ];
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }

  const subject = meta.subject || "(no subject)";
  // the address is always the signed-in mailbox; only the display name is configurable —
  // strip anything that could break the header
  const fromName = (meta.fromName || user.name).replace(/[<>"\r\n]/g, "").trim() || user.name;
  const headers = meta.inReplyTo ? { "In-Reply-To": meta.inReplyTo, References: meta.inReplyTo } : undefined;

  const { data, error } = await resend().emails.send({
    from: `${fromName} <${user.email}>`,
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    replyTo: meta.replyTo || undefined,
    subject,
    html: meta.html,
    text: meta.text,
    headers,
    scheduledAt: meta.scheduledAt || undefined,
    attachments: attachments.length ? attachments : undefined,
  });
  if (error || !data) {
    return Response.json({ error: error?.message ?? "Resend rejected the email" }, { status: 502 });
  }

  await userDb(user).sent.upsert({
    id: data.id,
    to, cc, bcc, subject,
    html: meta.html,
    text: meta.text,
    attachments: [
      ...files.map((f) => ({ filename: f.name, size: f.size })),
      ...remote.map((r) => ({ filename: r.filename, size: r.size })),
    ],
    scheduledAt: meta.scheduledAt || null,
    sentAt: new Date().toISOString(),
  });
  return Response.json({ id: data.id });
});
