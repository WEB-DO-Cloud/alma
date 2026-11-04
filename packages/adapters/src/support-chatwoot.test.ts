import { createHmac } from "node:crypto";
import { supportBotLabel } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  acceptSupportReply,
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
    const prisma = { supportLink: { findFirst: vi.fn() } };
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
