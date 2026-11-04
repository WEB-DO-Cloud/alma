import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AdapterContext,
  ArtifactStore,
  JobPublisher,
  NotificationProvider,
} from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import { supportBotLabel } from "@rakazo/contracts";
import { truncatedPlainText } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  appendEventInTransaction,
  countUnreadInboxChats,
  createThreadMessageInTransaction,
  runAsSystem,
  runAsTenant,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

export const SUPPORT_FORWARD_WINDOW_MS = 24 * 60 * 60 * 1000;
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
const PUSH_BODY_CHARS = 120;

export interface SupportChatwootConfig {
  baseUrl: string;
  accountId: string;
  inboxId: string;
  inboxIdentifier: string;
  apiToken: string;
  /** Signs X-Chatwoot-Signature. Absent means the URL secret is the only check. */
  inboxWebhookSecret?: string;
  /** Optional identity validation key for contact identifier_hash. */
  hmacKey?: string;
  /** Secret embedded in the webhook URL path. */
  urlSecret: string;
  enabled: boolean;
  /** When set, only these user ids receive the bot. */
  allowlist: readonly string[] | null;
}

export function loadSupportChatwootConfig(
  source: NodeJS.ProcessEnv = process.env,
): SupportChatwootConfig | null {
  const enabled = source.SUPPORT_BOT_ENABLED === "true";
  const baseUrl = trimSlash(source.CHATWOOT_BASE_URL);
  const accountId = source.CHATWOOT_ACCOUNT_ID?.trim() ?? "";
  const inboxId = source.CHATWOOT_INBOX_ID?.trim() ?? "";
  const inboxIdentifier = source.CHATWOOT_INBOX_IDENTIFIER?.trim() ?? "";
  const apiToken = source.CHATWOOT_API_TOKEN?.trim() ?? "";
  const urlSecret = source.ALMA_CHATWOOT_WEBHOOK_SECRET?.trim() ?? "";
  const inboxWebhookSecret = source.CHATWOOT_INBOX_WEBHOOK_SECRET?.trim() || undefined;
  const hmacKey = source.CHATWOOT_HMAC_KEY?.trim() || undefined;
  const allowRaw = source.SUPPORT_BOT_USERS?.trim();
  const allowlist = allowRaw
    ? allowRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;
  if (!baseUrl || !accountId || !inboxId || !inboxIdentifier || !apiToken || !urlSecret) {
    return enabled ? null : emptyConfig(allowlist);
  }
  return {
    baseUrl,
    accountId,
    inboxId,
    inboxIdentifier,
    apiToken,
    inboxWebhookSecret,
    hmacKey,
    urlSecret,
    enabled,
    allowlist,
  };
}

function emptyConfig(allowlist: readonly string[] | null): SupportChatwootConfig | null {
  return {
    baseUrl: "",
    accountId: "",
    inboxId: "",
    inboxIdentifier: "",
    apiToken: "",
    urlSecret: "",
    enabled: false,
    allowlist,
  };
}

/** True when the switch is on, the connection is complete, and this user is allowed. */
export function supportBotActive(
  config: SupportChatwootConfig | null,
  userId?: string,
): config is SupportChatwootConfig {
  if (!config?.enabled || !config.baseUrl || !config.apiToken || !config.urlSecret) return false;
  if (!userId || !config.allowlist) return Boolean(userId ? true : config.baseUrl);
  return config.allowlist.includes(userId);
}

export function supportIdentifierHash(hmacKey: string, userId: string): string {
  return createHmac("sha256", hmacKey).update(userId).digest("hex");
}

export interface WebhookCheckInput {
  enabled: boolean;
  urlSecret: string;
  providedSecret: string;
  inboxWebhookSecret?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  rawBody: string;
  now: number;
  accountId: string;
  inboxId: string;
  payloadAccountId?: string;
  payloadInboxId?: string;
}

export type WebhookCheck =
  | { ok: true; mode: "signature" | "backup" }
  | { ok: false; status: 401 | 404; reason: string };

/**
 * Signature when Chatwoot sends one: sha256= + HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 * The URL secret and the account and inbox ids are always required. A missing signature
 * falls back to those two checks.
 */
export function verifySupportWebhook(input: WebhookCheckInput): WebhookCheck {
  if (!input.enabled || !input.urlSecret) return { ok: false, status: 404, reason: "disabled" };
  if (!safeEqual(input.providedSecret, input.urlSecret)) {
    return { ok: false, status: 401, reason: "url_secret" };
  }
  if (
    input.payloadAccountId === undefined ||
    input.payloadInboxId === undefined ||
    input.payloadAccountId !== input.accountId ||
    input.payloadInboxId !== input.inboxId
  ) {
    return { ok: false, status: 401, reason: "account_or_inbox" };
  }
  const signature = input.signatureHeader?.trim();
  if (!signature) return { ok: true, mode: "backup" };
  if (!input.inboxWebhookSecret)
    return { ok: false, status: 401, reason: "signature_unconfigured" };
  const timestamp = input.timestampHeader?.trim() ?? "";
  const stamped = parseTimestamp(timestamp);
  if (stamped === null) return { ok: false, status: 401, reason: "timestamp" };
  const age = input.now - stamped;
  if (age > SIGNATURE_WINDOW_MS || stamped - input.now > SIGNATURE_WINDOW_MS) {
    return { ok: false, status: 401, reason: "timestamp" };
  }
  const expected =
    "sha256=" +
    createHmac("sha256", input.inboxWebhookSecret)
      .update(`${timestamp}.${input.rawBody}`)
      .digest("hex");
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) {
    return { ok: false, status: 401, reason: "signature" };
  }
  return { ok: true, mode: "signature" };
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseTimestamp(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
}

function trimSlash(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export class ChatwootRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatwootRequestError";
  }
}

type FetchLike = typeof fetch;

export function createChatwootClient(config: SupportChatwootConfig, fetchImpl: FetchLike = fetch) {
  const headers = { api_access_token: config.apiToken, Accept: "application/json" };
  const account = encodeURIComponent(config.accountId);

  async function request(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ChatwootRequestError(response.status, `Chatwoot ${response.status}`);
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }

  return {
    async ensureContact(input: { userId: string; name: string; email: string }): Promise<{
      contactId: string;
      sourceId: string;
    }> {
      const body: Record<string, string> = {
        identifier: input.userId,
        name: input.name,
        email: input.email,
      };
      if (config.hmacKey)
        body.identifier_hash = supportIdentifierHash(config.hmacKey, input.userId);
      try {
        const created = (await request(
          `${config.baseUrl}/public/api/v1/inboxes/${encodeURIComponent(config.inboxIdentifier)}/contacts`,
          { method: "POST", body: JSON.stringify(body) },
        )) as { id?: number | string; source_id?: string };
        if (created.source_id && created.id !== undefined) {
          return { contactId: String(created.id), sourceId: created.source_id };
        }
      } catch (error) {
        if (!(error instanceof ChatwootRequestError) || error.status < 400 || error.status >= 500) {
          throw error;
        }
      }
      const found = await findContact(request, config, input.userId, input.email);
      if (!found) throw new ChatwootRequestError(404, "Chatwoot contact was not created");
      return found;
    },

    async createConversation(sourceId: string): Promise<string> {
      const created = (await request(
        `${config.baseUrl}/public/api/v1/inboxes/${encodeURIComponent(config.inboxIdentifier)}/contacts/${encodeURIComponent(sourceId)}/conversations`,
        { method: "POST", body: JSON.stringify({}) },
      )) as { id?: number | string };
      if (created.id === undefined)
        throw new ChatwootRequestError(502, "Chatwoot conversation id missing");
      return String(created.id);
    },

    async conversationStatus(conversationId: string): Promise<"open" | "resolved" | "missing"> {
      try {
        const row = (await request(
          `${config.baseUrl}/api/v1/accounts/${account}/conversations/${encodeURIComponent(conversationId)}`,
        )) as { status?: string };
        return row.status === "resolved" ? "resolved" : "open";
      } catch (error) {
        if (error instanceof ChatwootRequestError && error.status === 404) return "missing";
        throw error;
      }
    },

    async reopen(conversationId: string): Promise<void> {
      await request(
        `${config.baseUrl}/api/v1/accounts/${account}/conversations/${encodeURIComponent(conversationId)}/toggle_status`,
        { method: "POST", body: JSON.stringify({ status: "open" }) },
      );
    },

    async postIncoming(input: {
      sourceId: string;
      conversationId: string;
      content: string;
      echoId: string;
      attachments: Array<{ name: string; mimeType: string; bytes: Uint8Array }>;
    }): Promise<void> {
      const url = `${config.baseUrl}/public/api/v1/inboxes/${encodeURIComponent(config.inboxIdentifier)}/contacts/${encodeURIComponent(input.sourceId)}/conversations/${encodeURIComponent(input.conversationId)}/messages`;
      if (input.attachments.length === 0) {
        await request(url, {
          method: "POST",
          body: JSON.stringify({
            content: input.content,
            echo_id: input.echoId,
            message_type: "incoming",
          }),
        });
        return;
      }
      const form = new FormData();
      form.set("content", input.content);
      form.set("echo_id", input.echoId);
      form.set("message_type", "incoming");
      for (const file of input.attachments) {
        form.append(
          "attachments[]",
          new Blob([Uint8Array.from(file.bytes)], { type: file.mimeType }),
          file.name,
        );
      }
      await request(url, { method: "POST", body: form });
    },

    async deleteContact(contactId: string): Promise<void> {
      try {
        await request(
          `${config.baseUrl}/api/v1/accounts/${account}/contacts/${encodeURIComponent(contactId)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        if (error instanceof ChatwootRequestError && error.status === 404) return;
        throw error;
      }
    },

    async download(dataUrl: string): Promise<Uint8Array> {
      const target = new URL(dataUrl);
      const base = new URL(config.baseUrl);
      if (!attachmentUrlAllowed(target, base)) {
        throw new ChatwootRequestError(400, "Attachment URL is not allowed");
      }
      const response = await fetchImpl(target, { headers });
      if (!response.ok)
        throw new ChatwootRequestError(response.status, "Attachment download failed");
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

async function findContact(
  request: (url: string, init?: RequestInit) => Promise<unknown>,
  config: SupportChatwootConfig,
  userId: string,
  email: string,
): Promise<{ contactId: string; sourceId: string } | null> {
  const query = encodeURIComponent(userId || email);
  const body = (await request(
    `${config.baseUrl}/api/v1/accounts/${encodeURIComponent(config.accountId)}/contacts/search?q=${query}&include_contacts=true`,
  )) as { payload?: Array<Record<string, unknown>> };
  const rows = body.payload ?? [];
  for (const row of rows) {
    if (String(row.identifier ?? "") !== userId && String(row.email ?? "") !== email) continue;
    const inboxes = Array.isArray(row.contact_inboxes) ? row.contact_inboxes : [];
    for (const inbox of inboxes) {
      if (!inbox || typeof inbox !== "object") continue;
      const record = inbox as {
        source_id?: string;
        inbox_id?: number | string;
        inbox?: { id?: number | string };
      };
      const inboxId = String(record.inbox_id ?? record.inbox?.id ?? "");
      if (inboxId === config.inboxId && record.source_id) {
        return { contactId: String(row.id), sourceId: record.source_id };
      }
    }
  }
  return null;
}

function attachmentUrlAllowed(target: URL, base: URL): boolean {
  if (target.host === base.host) return target.protocol === "https:" || target.protocol === "http:";
  if (target.protocol !== "https:") return false;
  return !isPrivateHost(target.hostname);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  const [a, b] = parts as [number, number, number, number];
  if (parts.some((part) => part > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export async function forwardSupportMessage(
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    config?: SupportChatwootConfig | null;
    fetchImpl?: FetchLike;
  },
  messageId: string,
): Promise<void> {
  const config = deps.config === undefined ? loadSupportChatwootConfig() : deps.config;
  const loaded = await runAsSystem("load a support message to forward", () =>
    deps.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        blocks: true,
        createdAt: true,
        thread: {
          select: {
            id: true,
            spaceId: true,
            userId: true,
            botId: true,
            bot: { select: { kind: true } },
          },
        },
      },
    }),
  );
  if (!loaded?.thread?.botId || loaded.thread.bot?.kind !== "support") return;
  const thread = loaded.thread;
  if (!supportBotActive(config, thread.userId)) return;
  const blocks = loaded.blocks as MessageBlock[];
  if (blocks.some((block) => "supportDelivery" in block && block.supportDelivery === "sent"))
    return;

  const age = Date.now() - loaded.createdAt.getTime();
  try {
    await runAsTenant({ spaceId: thread.spaceId, userId: thread.userId }, async () => {
      const client = createChatwootClient(config, deps.fetchImpl);
      const user = await deps.prisma.user.findUnique({
        where: { id: thread.userId },
        select: { name: true, email: true },
      });
      if (!user) return;
      let link = await deps.prisma.supportLink.findUnique({ where: { userId: thread.userId } });
      if (!link) return;
      if (!link.chatwootContactId || !link.chatwootSourceId) {
        const contact = await client.ensureContact({
          userId: thread.userId,
          name: user.name,
          email: user.email,
        });
        link = await deps.prisma.supportLink.update({
          where: { userId: thread.userId },
          data: { chatwootContactId: contact.contactId, chatwootSourceId: contact.sourceId },
        });
      }
      let conversationId = link.chatwootConversationId;
      if (conversationId) {
        const status = await client.conversationStatus(conversationId);
        if (status === "missing") conversationId = null;
        else if (status === "resolved") await client.reopen(conversationId);
      }
      if (!conversationId) {
        conversationId = await client.createConversation(link.chatwootSourceId!);
        await deps.prisma.supportLink.update({
          where: { userId: thread.userId },
          data: { chatwootConversationId: conversationId },
        });
      }
      const text = blocks
        .filter((block): block is Extract<MessageBlock, { kind: "text" }> => block.kind === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const attachments = [];
      for (const block of blocks) {
        if (block.kind !== "file" && block.kind !== "image") continue;
        const row = await deps.prisma.artifact.findFirst({
          where: { id: block.artifactId, spaceId: thread.spaceId, userId: thread.userId },
          select: { storageKey: true, name: true, mimeType: true },
        });
        if (!row) continue;
        const bytes = await deps.artifacts.get(row.storageKey, supportContext(thread, messageId));
        attachments.push({ name: row.name, mimeType: row.mimeType, bytes });
      }
      await client.postIncoming({
        sourceId: link.chatwootSourceId!,
        conversationId,
        content: text,
        echoId: messageId,
        attachments,
      });
      await markDelivery(deps.prisma, messageId, blocks, "sent");
    });
  } catch (error) {
    if (age >= SUPPORT_FORWARD_WINDOW_MS) {
      await runAsTenant({ spaceId: thread.spaceId, userId: thread.userId }, () =>
        markDelivery(deps.prisma, messageId, blocks, "failed"),
      ).catch((markError) => {
        getLogger().error("support forward failure mark", markError);
      });
      getLogger().error("support forward gave up", { messageId, status: statusOf(error) });
      return;
    }
    getLogger().warn("support forward will retry", { messageId, status: statusOf(error) });
    throw error;
  }
}

async function markDelivery(
  prisma: PrismaClient,
  messageId: string,
  blocks: MessageBlock[],
  supportDelivery: "sent" | "failed",
): Promise<void> {
  const next = blocks.map((block, index) => (index === 0 ? { ...block, supportDelivery } : block));
  await prisma.message.update({
    where: { id: messageId },
    data: { blocks: next as never },
  });
}

function supportContext(
  thread: { spaceId: string; userId: string; botId: string | null },
  messageId: string,
): AdapterContext {
  return {
    operationId: "support.forward",
    traceId: messageId,
    spaceId: thread.spaceId,
    userId: thread.userId,
    ...(thread.botId ? { botId: thread.botId } : {}),
    signal: AbortSignal.timeout(30_000),
  };
}

function statusOf(error: unknown): number | undefined {
  return error instanceof ChatwootRequestError ? error.status : undefined;
}

export interface InboundSupportReply {
  chatwootMessageId: string;
  conversationId: string;
  content: string;
  agentName: string;
  attachments: Array<{ dataUrl: string; mimeType: string; name: string }>;
  echoId?: string;
  privateNote: boolean;
  outgoing: boolean;
}

export function readInboundReply(payload: unknown): InboundSupportReply | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const event = String(body.event ?? "");
  if (event !== "message_created") return null;
  const messageType = body.message_type;
  const outgoing = messageType === "outgoing" || messageType === 1;
  const privateNote = body.private === true || body.private === "true";
  const conversation = asRecord(body.conversation);
  const sender = asRecord(body.sender);
  const id = body.id ?? asRecord(body.message)?.id;
  return {
    chatwootMessageId: id === undefined ? "" : String(id),
    conversationId: conversation?.id === undefined ? "" : String(conversation.id),
    content: typeof body.content === "string" ? body.content : "",
    agentName: firstName(typeof sender?.name === "string" ? sender.name : ""),
    attachments: readAttachments(body.attachments),
    echoId: typeof body.echo_id === "string" ? body.echo_id : undefined,
    privateNote,
    outgoing,
  };
}

export function payloadAccountId(payload: unknown): string | undefined {
  const body = asRecord(payload);
  const account = asRecord(body?.account);
  const id = account?.id ?? body?.account_id ?? asRecord(body?.conversation)?.account_id;
  return id === undefined ? undefined : String(id);
}

export function payloadInboxId(payload: unknown): string | undefined {
  const body = asRecord(payload);
  const inbox = asRecord(body?.inbox);
  const conversation = asRecord(body?.conversation);
  const id = inbox?.id ?? body?.inbox_id ?? conversation?.inbox_id;
  return id === undefined ? undefined : String(id);
}

function readAttachments(
  value: unknown,
): Array<{ dataUrl: string; mimeType: string; name: string }> {
  if (!Array.isArray(value)) return [];
  const files = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row || typeof row.data_url !== "string") continue;
    const mime =
      typeof row.data_type === "string" && row.data_type.includes("/")
        ? row.data_type
        : fileTypeMime(typeof row.file_type === "string" ? row.file_type : "");
    const name =
      typeof row.fallback_title === "string" && row.fallback_title
        ? row.fallback_title
        : fileNameFromUrl(row.data_url);
    files.push({ dataUrl: row.data_url, mimeType: mime, name });
  }
  return files;
}

function fileTypeMime(fileType: string): string {
  if (fileType === "image") return "image/jpeg";
  if (fileType === "audio") return "audio/mpeg";
  if (fileType === "video") return "video/mp4";
  return "application/octet-stream";
}

function fileNameFromUrl(dataUrl: string): string {
  try {
    const name = new URL(dataUrl).pathname.split("/").pop();
    return name && name.length > 0 ? name : "attachment";
  } catch {
    return "attachment";
  }
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function acceptSupportReply(
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    events: ThreadEvents;
    notifications?: NotificationProvider;
    config: SupportChatwootConfig;
    fetchImpl?: FetchLike;
  },
  reply: InboundSupportReply,
): Promise<"stored" | "ignored" | "duplicate"> {
  if (!reply.outgoing || reply.privateNote || !reply.chatwootMessageId || !reply.conversationId) {
    return "ignored";
  }
  if (reply.echoId) return "ignored";
  const link = await runAsSystem("find the support chat for a Chatwoot reply", () =>
    deps.prisma.supportLink.findFirst({
      where: { chatwootConversationId: reply.conversationId },
    }),
  );
  if (!link) return "ignored";
  const existing = await runAsSystem("check a Chatwoot reply was already stored", () =>
    deps.prisma.supportInboundMessage.findUnique({
      where: { chatwootMessageId: reply.chatwootMessageId },
      select: { messageId: true },
    }),
  );
  if (existing) return "duplicate";

  const client = createChatwootClient(deps.config, deps.fetchImpl);
  const files: Array<{ dataUrl: string; mimeType: string; name: string; bytes: Uint8Array }> = [];
  for (const attachment of reply.attachments) {
    const bytes = await client.download(attachment.dataUrl);
    files.push({ ...attachment, bytes });
  }

  const stored = await runAsTenant({ spaceId: link.spaceId, userId: link.userId }, async () => {
    const thread = await deps.prisma.thread.findUnique({
      where: { botId: link.botId },
      select: { id: true },
    });
    if (!thread) return null;
    const blocks: MessageBlock[] = [];
    if (reply.content.trim()) {
      blocks.push({
        kind: "text",
        text: reply.content,
        source: "chatwoot",
        ...(reply.agentName ? { agentName: reply.agentName } : {}),
      });
    }
    for (const file of files) {
      const context = supportContext(
        { spaceId: link.spaceId, userId: link.userId, botId: link.botId },
        reply.chatwootMessageId,
      );
      const put = await deps.artifacts.put(
        { name: file.name, mimeType: file.mimeType, bytes: file.bytes },
        context,
      );
      const artifact = await deps.prisma.artifact.create({
        data: {
          spaceId: link.spaceId,
          userId: link.userId,
          botId: link.botId,
          name: file.name,
          mimeType: file.mimeType,
          size: file.bytes.byteLength,
          hash: put.hash,
          storageKey: put.id,
        },
      });
      if (file.mimeType.startsWith("image/")) {
        blocks.push({
          kind: "image",
          artifactId: artifact.id,
          mimeType: file.mimeType,
          name: file.name,
          source: "chatwoot",
          ...(reply.agentName ? { agentName: reply.agentName } : {}),
        });
      } else {
        blocks.push({
          kind: "file",
          artifactId: artifact.id,
          mimeType: file.mimeType,
          name: file.name,
          size: file.bytes.byteLength,
          source: "chatwoot",
          ...(reply.agentName ? { agentName: reply.agentName } : {}),
        });
      }
    }
    if (blocks.length === 0) return null;
    try {
      return await deps.prisma.$transaction(async (tx) => {
        const message = await createThreadMessageInTransaction(tx, {
          threadId: thread.id,
          role: "bot",
          blocks,
          botId: link.botId,
          markUnread: true,
        });
        await tx.supportInboundMessage.create({
          data: {
            chatwootMessageId: reply.chatwootMessageId,
            messageId: message.id,
            userId: link.userId,
            spaceId: link.spaceId,
          },
        });
        const event = await appendEventInTransaction(tx, {
          spaceId: link.spaceId,
          threadId: thread.id,
          botId: link.botId,
          type: "thread.message.created",
          payload: {
            messageId: message.id,
            seq: message.seq,
            role: "bot",
            blocks,
          },
        });
        return { threadId: thread.id, seq: event.seq, messageId: message.id, text: reply.content };
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return "duplicate" as const;
      }
      throw error;
    }
  });
  if (stored === "duplicate") return "duplicate";
  if (!stored) return "ignored";
  await deps.events.notify(stored.threadId, stored.seq).catch((error) => {
    getLogger().error("support reply realtime notification", error);
  });
  await pushSupportReply(deps, link, stored.threadId, stored.text).catch((error) => {
    getLogger().error("support reply push", error);
  });
  return "stored";
}

async function pushSupportReply(
  deps: { prisma: PrismaClient; notifications?: NotificationProvider },
  link: { spaceId: string; userId: string; botId: string },
  threadId: string,
  text: string,
): Promise<void> {
  if (!deps.notifications) return;
  const user = await runAsTenant({ spaceId: link.spaceId, userId: link.userId }, () =>
    deps.prisma.user.findUnique({ where: { id: link.userId }, select: { locale: true } }),
  );
  const title = supportBotLabel(user?.locale);
  const body = truncatedPlainText(text, PUSH_BODY_CHARS);
  const badge = await countUnreadInboxChats(deps.prisma, {
    userId: link.userId,
    spaceId: link.spaceId,
  }).catch(() => undefined);
  await deps.notifications.send(
    {
      kind: "completion",
      title,
      body,
      botId: link.botId,
      threadId,
      ...(badge === undefined ? {} : { badge }),
    },
    {
      operationId: "support.notify",
      traceId: link.botId,
      spaceId: link.spaceId,
      userId: link.userId,
      botId: link.botId,
      signal: AbortSignal.timeout(15_000),
    },
  );
}

export async function deleteSupportContact(
  prisma: PrismaClient,
  userId: string,
  config: SupportChatwootConfig | null = loadSupportChatwootConfig(),
  fetchImpl?: FetchLike,
): Promise<void> {
  const link = await runAsSystem("read the support contact before account deletion", () =>
    prisma.supportLink.findUnique({
      where: { userId },
      select: { chatwootContactId: true },
    }),
  );
  if (!link?.chatwootContactId) return;
  if (!config?.baseUrl || !config.apiToken || !config.accountId) {
    throw new Error("Support contact cannot be deleted without Chatwoot configuration");
  }
  await createChatwootClient(config, fetchImpl).deleteContact(link.chatwootContactId);
}

export async function claimWebhookDelivery(
  prisma: PrismaClient,
  deliveryId: string,
): Promise<boolean> {
  try {
    await runAsSystem("record a Chatwoot webhook delivery", () =>
      prisma.supportWebhookDelivery.create({ data: { deliveryId } }),
    );
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

export async function releaseWebhookDelivery(
  prisma: PrismaClient,
  deliveryId: string,
): Promise<void> {
  await runAsSystem("release a Chatwoot webhook delivery after a failed attempt", () =>
    prisma.supportWebhookDelivery.deleteMany({ where: { deliveryId } }),
  ).catch(() => undefined);
}

export function supportForwardJob(messageId: string) {
  return {
    name: "support.forward" as const,
    payload: { messageId },
    replaceKey: `support.forward:${messageId}`,
    maxAttempts: 30,
  };
}

export async function retrySupportDelivery(
  deps: { prisma: PrismaClient; jobs: JobPublisher },
  input: { spaceId: string; userId: string; messageId: string },
): Promise<boolean> {
  const message = await deps.prisma.message.findFirst({
    where: {
      id: input.messageId,
      thread: { spaceId: input.spaceId, userId: input.userId, bot: { kind: "support" } },
    },
    select: { id: true, blocks: true },
  });
  if (!message) return false;
  const blocks = (message.blocks as MessageBlock[]).map((block) => {
    if (!("supportDelivery" in block) || block.supportDelivery !== "failed") return block;
    const { supportDelivery: _dropped, ...rest } = block;
    return rest;
  });
  await deps.prisma.message.update({
    where: { id: message.id },
    data: { blocks: blocks as never },
  });
  await deps.jobs.enqueue(supportForwardJob(message.id));
  return true;
}
