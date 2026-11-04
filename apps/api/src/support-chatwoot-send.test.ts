import type { JobPublisher, ProductAnalytics } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@rakazo/db", async () => {
  const actual = await vi.importActual<typeof import("@rakazo/db")>("@rakazo/db");
  return {
    ...actual,
    createThreadMessageInTransaction: vi.fn(async () => ({
      id: "message-1",
      seq: 3,
      createdAt: new Date("2026-11-04T00:00:00.000Z"),
    })),
    appendEventInTransaction: vi.fn(async () => ({ seq: 4 })),
  };
});

import { forwardSupportSend } from "./support-chatwoot-send.js";

const actor: Actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "ada@example.com",
  isDeploymentOwner: false,
};

describe("support send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the message and does not start a run", async () => {
    const enqueue = vi.fn(
      async (_job: { name: string; payload: { messageId: string } }) => undefined,
    );
    const notify = vi.fn(async () => undefined);
    const prisma = {
      message: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run({})),
    };
    const sent = await forwardSupportSend(
      {
        prisma: prisma as unknown as PrismaClient,
        events: { notify } as unknown as ThreadEvents,
        jobs: { enqueue } as unknown as JobPublisher,
        analytics: { capture: vi.fn() } as unknown as ProductAnalytics,
      },
      actor,
      { threadId: "thread-1", botId: "bot-1" },
      { text: "Need a hand", clientNonce: "nonce-1" },
    );
    expect(sent.runIds).toEqual([]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      name: "support.forward",
      payload: { messageId: "message-1" },
    });
    expect(enqueue.mock.calls.some(([job]) => job.name === "run.continue")).toBe(false);
    expect(notify).toHaveBeenCalledWith("thread-1", 4);
  });
});
