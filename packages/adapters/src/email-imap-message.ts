import { randomUUID } from "node:crypto";
import {
  EMAIL_IMAP_ATTACHMENT_MAX_BYTES,
  EMAIL_IMAP_BODY_MAX_CHARS,
  EMAIL_IMAP_MESSAGE_MAX_BYTES,
} from "@rakazo/contracts";
import PostalMime from "postal-mime";

export type MailAttachment = {
  filename: string;
  contentType: string;
  size: number;
  text?: string;
};

export type MailSummary = {
  messageId: string;
  inReplyTo: string;
  references: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: string;
  text: string;
  truncated: boolean;
  attachments: MailAttachment[];
};

export function buildRawMessage(input: {
  from: string;
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: readonly string[];
  messageId?: string;
}): Buffer {
  const headers = [
    `From: ${angle(input.from)}`,
    `To: ${input.to.map(angle).join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.map(angle).join(", ")}` : "",
    `Subject: ${headerText(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${angle(input.messageId ?? `${randomUUID()}@alma.local`)}`,
    input.inReplyTo ? `In-Reply-To: ${angle(input.inReplyTo)}` : "",
    input.references?.length ? `References: ${input.references.map(angle).join(" ")}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  return Buffer.from(
    `${headers.join("\r\n")}\r\n\r\n${input.text.replace(/\r?\n/g, "\r\n")}`,
    "utf8",
  );
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function forwardSubject(subject: string): string {
  const trimmed = subject.trim();
  return /^(fw|fwd):/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
}

export function threadReferences(references: string, messageId: string): string[] {
  const ids = references.split(/\s+/).filter(Boolean);
  const id = messageId.trim();
  if (id && !ids.some((item) => item.replace(/[<>]/g, "") === id.replace(/[<>]/g, "")))
    ids.push(id);
  return ids;
}

export function quoteMessage(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export async function summarizeMessage(raw: Uint8Array): Promise<MailSummary> {
  if (raw.byteLength > EMAIL_IMAP_MESSAGE_MAX_BYTES) {
    throw Object.assign(new Error("too_large"), { code: "too_large" });
  }
  const parsed = await PostalMime.parse(raw);
  const textSource = parsed.text?.trim() ? parsed.text : htmlToText(parsed.html ?? "");
  const text = textSource.slice(0, EMAIL_IMAP_BODY_MAX_CHARS);
  const attachments = (parsed.attachments ?? []).map((attachment) => {
    const bytes = attachmentBytes(attachment.content);
    const contentType = attachment.mimeType || "application/octet-stream";
    const textPart = textAttachment(contentType, bytes);
    return {
      filename: attachment.filename || "attachment",
      contentType,
      size: bytes.byteLength,
      ...(textPart !== undefined ? { text: textPart } : {}),
    };
  });
  return {
    messageId: parsed.messageId ?? "",
    inReplyTo: parsed.inReplyTo ?? "",
    references: parsed.references ?? "",
    from: addressText(parsed.from),
    to: addressList(parsed.to),
    cc: addressList(parsed.cc),
    subject: parsed.subject ?? "",
    date: parsed.date ?? "",
    text,
    truncated: textSource.length > text.length,
    attachments,
  };
}

export function attachmentText(contentType: string, bytes: Uint8Array): string | null {
  if (bytes.byteLength > EMAIL_IMAP_ATTACHMENT_MAX_BYTES) return null;
  return textAttachment(contentType, bytes) ?? null;
}

function textAttachment(contentType: string, bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > EMAIL_IMAP_ATTACHMENT_MAX_BYTES) return undefined;
  const type = contentType.toLowerCase();
  const textual =
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    type.endsWith("+json") ||
    type.endsWith("+xml");
  if (!textual) return undefined;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text.slice(0, EMAIL_IMAP_BODY_MAX_CHARS);
}

function attachmentBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function addressList(
  value: { address?: string; group?: { address?: string }[] }[] | undefined,
): string[] {
  if (!value) return [];
  return value.flatMap((item) =>
    item.group
      ? item.group.map((member) => member.address ?? "").filter(Boolean)
      : item.address
        ? [item.address]
        : [],
  );
}

function addressText(
  value: { address?: string; group?: { address?: string }[] } | undefined,
): string {
  if (!value) return "";
  if (value.group)
    return value.group
      .map((member) => member.address ?? "")
      .filter(Boolean)
      .join(", ");
  return value.address ?? "";
}

function angle(value: string): string {
  const bare = value.trim().replace(/[<>]/g, "");
  return `<${bare}>`;
}

function headerText(value: string): string {
  const single = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\t\x20-\x7e]*$/.test(single)
    ? single
    : `=?UTF-8?B?${Buffer.from(single, "utf8").toString("base64")}?=`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
