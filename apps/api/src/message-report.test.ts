import { ORPCError } from "@orpc/server";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { reportAssistantMessage } from "./message-report.js";

const actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "ada@example.com",
  isDeploymentOwner: false,
};

function prismaFor(message: { id: string; role: string } | null) {
  const create = vi.fn(async () => ({ id: "report-1" }));
  return {
    create,
    prisma: {
      message: { findFirst: vi.fn(async () => message) },
      messageReport: { create },
    },
  };
}

describe("reportAssistantMessage", () => {
  it("stores a report of an assistant response", async () => {
    const { prisma, create } = prismaFor({ id: "message-1", role: "bot" });
    await reportAssistantMessage(prisma as never, actor, "thread-1", "message-1");
    expect(create).toHaveBeenCalledWith({
      data: {
        spaceId: "space-1",
        userId: "user-1",
        threadId: "thread-1",
        messageId: "message-1",
      },
    });
  });

  it("treats a second report of the same response as already stored", async () => {
    const { prisma, create } = prismaFor({ id: "message-1", role: "bot" });
    create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(
      reportAssistantMessage(prisma as never, actor, "thread-1", "message-1"),
    ).resolves.toBeUndefined();
  });

  it("hides a message that is not in the thread", async () => {
    const { prisma, create } = prismaFor(null);
    await expect(
      reportAssistantMessage(prisma as never, actor, "thread-1", "message-1"),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a report of a user message", async () => {
    const { prisma, create } = prismaFor({ id: "message-1", role: "user" });
    await expect(
      reportAssistantMessage(prisma as never, actor, "thread-1", "message-1"),
    ).rejects.toBeInstanceOf(ORPCError);
    expect(create).not.toHaveBeenCalled();
  });
});
