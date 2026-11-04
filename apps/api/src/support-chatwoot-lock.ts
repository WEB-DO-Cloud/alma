import { ORPCError } from "@orpc/server";

export class SupportBotLockedError extends Error {
  constructor() {
    super("support_bot_locked");
    this.name = "SupportBotLockedError";
  }
}

/** Users cannot delete, archive, rename, or unpin the support chat. */
export function supportBotMutationLocked(
  bot: { kind?: string | null },
  patch: { name?: string; pinned?: boolean; archive?: boolean; remove?: boolean },
): boolean {
  if (bot.kind !== "support") return false;
  if (patch.remove || patch.archive) return true;
  if (patch.name !== undefined && patch.name !== "Support") return true;
  if (patch.pinned === false) return true;
  return false;
}

export function rejectSupportBotLock(): never {
  throw new ORPCError("FORBIDDEN", { message: "support_bot_locked" });
}
