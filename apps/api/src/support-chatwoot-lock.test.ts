import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { rejectSupportBotLock, supportBotMutationLocked } from "./support-chatwoot-lock.js";

describe("support bot lock", () => {
  it("returns 403 for rename, unpin, archive, and delete", () => {
    const bot = { kind: "support" };
    expect(supportBotMutationLocked(bot, { name: "Helper" })).toBe(true);
    expect(supportBotMutationLocked(bot, { pinned: false })).toBe(true);
    expect(supportBotMutationLocked(bot, { archive: true })).toBe(true);
    expect(supportBotMutationLocked(bot, { remove: true })).toBe(true);
    expect(supportBotMutationLocked(bot, { name: "Support", pinned: true })).toBe(false);
    expect(supportBotMutationLocked({ kind: "standard" }, { remove: true })).toBe(false);
    expect(() => rejectSupportBotLock()).toThrow(ORPCError);
    try {
      rejectSupportBotLock();
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", message: "support_bot_locked" });
    }
  });
});
