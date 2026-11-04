import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@rakazo/db";
import { createDb, provisionMessagingIdentity, runAsSystem, runAsTenant } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupportChatwootConfig } from "./support-chatwoot.js";
import { acceptSupportReply, forwardSupportMessage } from "./support-chatwoot.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("support chat round trip (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let closeDb: () => Promise<void>;
  let server: Server;
  let baseUrl = "";
  let owner: { userId: string; spaceId: string };
  const calls: string[] = [];
  const stamp = String(Date.now()).slice(-7);

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    closeDb = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    owner = await runAsSystem("test fixture", () =>
      provisionMessagingIdentity(
        prisma,
        { provider: "sendblue", address: `+1666${stamp}` },
        { signupsEnabled: undefined, signupAllowlist: undefined },
      ),
    );
    server = createServer((req, res) => {
      const url = req.url ?? "";
      calls.push(`${req.method} ${url}`);
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        if (url.endsWith("/contacts") && req.method === "POST") {
          res.end(JSON.stringify({ id: 9, source_id: "source-1" }));
          return;
        }
        if (url.endsWith("/conversations") && req.method === "POST") {
          res.end(JSON.stringify({ id: 42 }));
          return;
        }
        if (url.includes("/toggle_status")) {
          res.end(JSON.stringify({ status: "open" }));
          return;
        }
        if (req.method === "GET" && url.includes("/conversations/42")) {
          res.end(JSON.stringify({ id: 42, status: "resolved" }));
          return;
        }
        if (req.method === "POST" && url.includes("/messages")) {
          expect(raw).toContain("Need help");
          res.end(JSON.stringify({ id: 7 }));
          return;
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server?.close();
    if (prisma && owner) {
      await runAsSystem("test fixture cleanup", async () => {
        await prisma.supportLink.deleteMany({ where: { userId: owner.userId } });
        await prisma.organization.deleteMany({ where: { id: owner.spaceId } });
        await prisma.user.deleteMany({ where: { id: owner.userId } });
      });
    }
    await closeDb?.();
  });

  it("forwards a user message, reopens a resolved conversation, and stores the agent reply", async () => {
    const { ensureSupportBot } = await import("@rakazo/db");
    const link = await ensureSupportBot(prisma, { userId: owner.userId, spaceId: owner.spaceId });
    expect(link?.botId).toBeTruthy();
    const thread = await runAsSystem("read support thread", () =>
      prisma.thread.findUniqueOrThrow({ where: { botId: link!.botId } }),
    );
    const message = await runAsTenant(owner, () =>
      prisma.message.create({
        data: {
          threadId: thread.id,
          seq: 0,
          role: "user",
          blocks: [{ kind: "text", text: "Need help" }],
        },
      }),
    );
    await runAsTenant(owner, () =>
      prisma.thread.update({ where: { id: thread.id }, data: { nextMessageSeq: 1 } }),
    );
    const config: SupportChatwootConfig = {
      baseUrl,
      accountId: "178581",
      inboxId: "153144",
      inboxIdentifier: "alma-app",
      apiToken: "token",
      urlSecret: "url-secret",
      hmacKey: "hmac",
      enabled: true,
      allowlist: null,
    };
    const artifacts = {
      describe: () => ({ id: "memory", capabilities: {} }),
      put: vi.fn(async () => ({ id: "stored", hash: "abc" })),
      get: vi.fn(),
      remove: vi.fn(),
    };
    await forwardSupportMessage({ prisma, artifacts: artifacts as never, config }, message.id);
    expect(calls.some((call) => call.startsWith("POST") && call.includes("/contacts"))).toBe(true);
    expect(calls.some((call) => call.includes("/messages"))).toBe(true);
    await runAsTenant(owner, () =>
      prisma.message.update({
        where: { id: message.id },
        data: { blocks: [{ kind: "text", text: "Need help" }] },
      }),
    );
    await forwardSupportMessage({ prisma, artifacts: artifacts as never, config }, message.id);
    expect(calls.some((call) => call.includes("/toggle_status"))).toBe(true);
    const saved = await runAsSystem("read forwarded link", () =>
      prisma.supportLink.findUniqueOrThrow({ where: { userId: owner.userId } }),
    );
    expect(saved.chatwootConversationId).toBe("42");
    expect(
      await runAsSystem("count runs", () => prisma.run.count({ where: { botId: link!.botId } })),
    ).toBe(0);

    const notify = vi.fn(async () => undefined);
    const send = vi.fn(async () => undefined);
    const stored = await acceptSupportReply(
      {
        prisma,
        artifacts: artifacts as never,
        events: { notify } as never,
        notifications: { send, describe: () => ({}) as never },
        config,
      },
      {
        chatwootMessageId: "cw-7",
        conversationId: "42",
        content: "On it",
        agentName: "Ada",
        attachments: [],
        privateNote: false,
        outgoing: true,
      },
    );
    expect(stored).toBe("stored");
    const reply = await runAsTenant(owner, () =>
      prisma.message.findFirst({
        where: { threadId: thread.id, role: "bot" },
        select: { blocks: true, runId: true, botId: true },
      }),
    );
    expect(reply?.runId).toBeNull();
    expect(reply?.botId).toBe(link!.botId);
    expect(reply?.blocks).toMatchObject([
      { kind: "text", text: "On it", source: "chatwoot", agentName: "Ada" },
    ]);
    expect(notify).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Support", botId: link!.botId, threadId: thread.id }),
      expect.anything(),
    );
    const duplicate = await acceptSupportReply(
      {
        prisma,
        artifacts: artifacts as never,
        events: { notify } as never,
        config,
      },
      {
        chatwootMessageId: "cw-7",
        conversationId: "42",
        content: "On it",
        agentName: "Ada",
        attachments: [],
        privateNote: false,
        outgoing: true,
      },
    );
    expect(duplicate).toBe("duplicate");
  });
});
