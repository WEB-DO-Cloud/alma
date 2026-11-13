import { createHmac } from "node:crypto";
import { supportAgentName, supportBotLabel } from "@rakazo/contracts";
import { createLogger, createTestSink, getLogger, installLogger } from "@rakazo/logging";
import { describe, expect, it, vi } from "vitest";
import {
  acceptSupportReply,
  createChatwootClient,
  loadSupportChatwootConfig,
  readInboundReply,
  supportBotActive,
  supportIdentifierHash,
  verifySupportWebhook,
} from "./support-chatwoot.js";

const secret = "inbox-webhook-secret";
const urlSecret = "url-token";
const body = JSON.stringify({
  event: "message_created",
  id: 7,
  message_type: "outgoing",
  private: false,
  content: "hello",
  account: { id: 178581 },
  inbox: { id: 153144 },
  conversation: { id: 42 },
});

function signed(raw: string, timestamp: string) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `sha256=${digest}`;
}

function replyHarness(findFirst = vi.fn()) {
  const prisma = { supportLink: { findFirst } };
  const deps = {
    prisma,
    artifacts: { put: vi.fn(), get: vi.fn(), remove: vi.fn(), describe: vi.fn() },
    events: { notify: vi.fn() },
    config: {
      baseUrl: "https://app.chatwoot.com",
      accountId: "1",
      inboxId: "2",
      inboxIdentifier: "inbox",
      apiToken: "token",
      urlSecret: "secret",
      enabled: true,
      allowlist: null,
    },
  } as never;
  return { prisma, deps };
}

function check(overrides: Partial<Parameters<typeof verifySupportWebhook>[0]> = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return verifySupportWebhook({
    enabled: true,
    urlSecret,
    providedSecret: urlSecret,
    inboxWebhookSecret: secret,
    signatureHeader: signed(body, timestamp),
    timestampHeader: timestamp,
    rawBody: body,
    now: Date.now(),
    accountId: "178581",
    inboxId: "153144",
    payloadAccountId: "178581",
    payloadInboxId: "153144",
    ...overrides,
  });
}

describe("support chat webhook checks", () => {
  it("computes the contact identifier hash", () => {
    expect(supportIdentifierHash("hmac-key", "user-1")).toBe(
      createHmac("sha256", "hmac-key").update("user-1").digest("hex"),
    );
  });

  it("accepts a fresh signature and falls back when the signature is absent", () => {
    expect(check().ok).toBe(true);
    expect(check({ signatureHeader: undefined, timestampHeader: undefined })).toEqual({
      ok: true,
      mode: "backup",
    });
  });

  it("rejects a bad secret, a wrong account or inbox, a stale timestamp, and a bad signature", () => {
    expect(check({ providedSecret: "nope" })).toMatchObject({
      ok: false,
      status: 401,
      reason: "url_secret",
    });
    expect(check({ payloadAccountId: "1" })).toMatchObject({
      ok: false,
      reason: "account_or_inbox",
    });
    expect(check({ payloadInboxId: "9" })).toMatchObject({ ok: false, reason: "account_or_inbox" });
    const old = String(Math.floor(Date.now() / 1000) - 6 * 60);
    expect(check({ timestampHeader: old, signatureHeader: signed(body, old) })).toMatchObject({
      ok: false,
      reason: "timestamp",
    });
    expect(check({ signatureHeader: "sha256=deadbeef" })).toMatchObject({
      ok: false,
      reason: "signature",
    });
    expect(check({ enabled: false })).toMatchObject({ ok: false, status: 404 });
  });

  it("ignores private notes and echoes", async () => {
    const { prisma, deps } = replyHarness();
    expect(
      await acceptSupportReply(deps, {
        chatwootMessageId: "1",
        conversationId: "2",
        content: "note",
        agentName: "Ada",
        attachments: [],
        privateNote: true,
        outgoing: true,
      }),
    ).toBe("ignored");
    expect(
      await acceptSupportReply(deps, {
        chatwootMessageId: "1",
        conversationId: "2",
        content: "echo",
        agentName: "Ada",
        attachments: [],
        echoId: "message-1",
        privateNote: false,
        outgoing: true,
      }),
    ).toBe("ignored");
    expect(prisma.supportLink.findFirst).not.toHaveBeenCalled();
  });

  it("reads an outgoing reply and drops a private one from the event shape", () => {
    expect(readInboundReply(JSON.parse(body))?.content).toBe("hello");
    expect(
      readInboundReply({ ...JSON.parse(body), private: true, message_type: "outgoing" })
        ?.privateNote,
    ).toBe(true);
  });

  it("accepts a template payload and still ignores activity and private notes", async () => {
    const template = readInboundReply({
      event: "message_created",
      id: 9,
      message_type: 3,
      content: "We reply during business hours.",
      conversation: { id: 42 },
    });
    expect(template).toMatchObject({
      outgoing: true,
      privateNote: false,
      agentName: "",
      content: "We reply during business hours.",
      chatwootMessageId: "9",
      conversationId: "42",
    });
    expect(
      readInboundReply({
        event: "message_created",
        id: 10,
        message_type: "template",
        content: "Hello",
        conversation: { id: 42 },
      }),
    ).toMatchObject({ outgoing: true, privateNote: false, agentName: "" });

    const { prisma, deps } = replyHarness(vi.fn(async () => null));
    const sink = createTestSink();
    const previous = getLogger();
    installLogger(createLogger({ service: "test", level: "info", sinks: [sink] }));
    try {
      const activity = readInboundReply({
        event: "message_created",
        id: 11,
        message_type: 2,
        content: "Conversation was resolved by Ada Lovelace",
        conversation: { id: 42 },
        sender: { name: "Ada Lovelace" },
      });
      const namedActivity = readInboundReply({
        event: "message_created",
        id: 12,
        message_type: "activity",
        content: "assigned",
        conversation: { id: 42 },
      });
      const note = readInboundReply({
        event: "message_created",
        id: 13,
        message_type: "outgoing",
        private: true,
        content: "only agents can see this note",
        conversation: { id: 42 },
        sender: { name: "Ada Lovelace" },
      });
      expect(activity).toBeTruthy();
      expect(namedActivity).toBeTruthy();
      expect(note).toBeTruthy();
      expect(await acceptSupportReply(deps, activity!)).toBe("ignored");
      expect(await acceptSupportReply(deps, namedActivity!)).toBe("ignored");
      expect(await acceptSupportReply(deps, note!)).toBe("ignored");
      expect(await acceptSupportReply(deps, template!)).toBe("ignored");
      expect(prisma.supportLink.findFirst).toHaveBeenCalledTimes(1);

      const ignored = sink.events.filter(
        (event) => event.message === "support webhook message ignored",
      );
      expect(ignored.map((event) => event.reason)).toEqual([
        "activity",
        "activity",
        "private_note",
        "unknown_conversation",
      ]);
      expect(ignored.every((event) => event.level === "info")).toBe(true);
      const serialized = JSON.stringify(ignored);
      expect(serialized).not.toContain("only agents can see this note");
      expect(serialized).not.toContain("Ada");
      expect(serialized).not.toContain("We reply");
      expect(serialized).not.toContain("token");
    } finally {
      installLogger(previous);
    }
  });

  it("names a support reply with no sender ALMA Support", () => {
    expect(supportAgentName([{ source: "chatwoot" }])).toBe("ALMA Support");
    expect(supportAgentName([{ source: "chatwoot", agentName: "Ada" }])).toBe("Ada");
    expect(supportAgentName([{ source: "chatwoot", agentName: "  " }])).toBe("ALMA Support");
    expect(supportAgentName([{ kind: "text", text: "hi" }])).toBeNull();
  });

  it("picks Soporte for Spanish and Support otherwise", () => {
    expect(supportBotLabel("es")).toBe("Soporte");
    expect(supportBotLabel("es-DO")).toBe("Soporte");
    expect(supportBotLabel("en")).toBe("Support");
    expect(supportBotLabel(null)).toBe("Support");
  });

  it("stays off unless the switch and the connection are set", () => {
    expect(loadSupportChatwootConfig({})).toMatchObject({ enabled: false });
    expect(supportBotActive(loadSupportChatwootConfig({ SUPPORT_BOT_ENABLED: "true" }))).toBe(
      false,
    );
    const on = loadSupportChatwootConfig({
      SUPPORT_BOT_ENABLED: "true",
      CHATWOOT_BASE_URL: "https://app.chatwoot.com",
      CHATWOOT_ACCOUNT_ID: "178581",
      CHATWOOT_INBOX_ID: "153144",
      CHATWOOT_INBOX_IDENTIFIER: "identifier",
      CHATWOOT_API_TOKEN: "token",
      ALMA_CHATWOOT_WEBHOOK_SECRET: "url",
      SUPPORT_BOT_USERS: "user-a, user-b",
    });
    expect(supportBotActive(on, "user-a")).toBe(true);
    expect(supportBotActive(on, "user-c")).toBe(false);
  });
});

function chatwootConfig(hmacKey?: string) {
  return {
    baseUrl: "https://app.chatwoot.com",
    accountId: "1",
    inboxId: "2",
    inboxIdentifier: "inbox",
    apiToken: "token",
    urlSecret: "secret",
    enabled: true,
    allowlist: null as readonly string[] | null,
    ...(hmacKey ? { hmacKey } : {}),
  };
}

function mockChatwoot() {
  const calls: Array<{
    path: string;
    json?: unknown;
    form?: {
      content: string;
      echo_id: string;
      message_type: string;
      identifier_hash: string | null;
    };
  }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const raw = init?.body;
    if (raw instanceof FormData) {
      const hash = raw.get("identifier_hash");
      calls.push({
        path,
        form: {
          content: String(raw.get("content")),
          echo_id: String(raw.get("echo_id")),
          message_type: String(raw.get("message_type")),
          identifier_hash: hash === null ? null : String(hash),
        },
      });
    } else {
      calls.push({ path, json: JSON.parse(String(raw)) });
    }
    return new Response(JSON.stringify({ id: 42 }));
  });
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

const incoming = {
  sourceId: "source-1",
  conversationId: "42",
  content: "hello",
  echoId: "msg-1",
  userId: "user-1",
  attachments: [] as Array<{ name: string; mimeType: string; bytes: Uint8Array }>,
};

describe("chatwoot public api identifier hash", () => {
  it("sends the user hash when creating a conversation and posting a message", async () => {
    const { calls, fetchImpl } = mockChatwoot();
    const client = createChatwootClient(chatwootConfig("hmac-key"), fetchImpl);
    const hash = supportIdentifierHash("hmac-key", "user-1");
    await expect(client.createConversation("source-1", "user-1")).resolves.toBe("42");
    await client.postIncoming(incoming);
    await client.postIncoming({
      ...incoming,
      content: "with file",
      echoId: "msg-2",
      attachments: [{ name: "note.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) }],
    });

    expect(calls[0]).toEqual({
      path: "/public/api/v1/inboxes/inbox/contacts/source-1/conversations",
      json: { identifier_hash: hash },
    });
    expect(calls[1]).toEqual({
      path: "/public/api/v1/inboxes/inbox/contacts/source-1/conversations/42/messages",
      json: {
        content: "hello",
        echo_id: "msg-1",
        message_type: "incoming",
        identifier_hash: hash,
      },
    });
    expect(calls[2]).toEqual({
      path: "/public/api/v1/inboxes/inbox/contacts/source-1/conversations/42/messages",
      form: {
        content: "with file",
        echo_id: "msg-2",
        message_type: "incoming",
        identifier_hash: hash,
      },
    });
  });

  it("omits the hash when no hmac key is configured", async () => {
    const { calls, fetchImpl } = mockChatwoot();
    const client = createChatwootClient(chatwootConfig(), fetchImpl);
    await client.createConversation("source-1", "user-1");
    await client.postIncoming(incoming);
    await client.postIncoming({
      ...incoming,
      attachments: [{ name: "note.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) }],
    });

    expect(calls[0]?.json).toEqual({});
    expect(calls[1]?.json).toEqual({
      content: "hello",
      echo_id: "msg-1",
      message_type: "incoming",
    });
    expect(calls[2]?.form).toEqual({
      content: "hello",
      echo_id: "msg-1",
      message_type: "incoming",
      identifier_hash: null,
    });
  });
});
