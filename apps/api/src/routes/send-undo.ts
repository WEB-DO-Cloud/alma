import { ORPCError } from "@orpc/server";
import { readSendUndoConfig, undoSeconds } from "@rakazo/core";
import { saveUndoSeconds, undoSecondsFor } from "@rakazo/db";
import type { RouterContext } from "./context.js";

function requireSendUndo(): void {
  if (!readSendUndoConfig().enabled) {
    throw new ORPCError("FORBIDDEN", { message: "send_undo_disabled" });
  }
}

export function sendUndoRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    sendUndo: {
      get: authed.sendUndo.get.handler(async ({ context }) => {
        requireSendUndo();
        return { seconds: await undoSecondsFor(deps.prisma, context.actor.userId) };
      }),
      update: authed.sendUndo.update.handler(async ({ context, input }) => {
        requireSendUndo();
        await saveUndoSeconds(deps.prisma, context.actor.userId, undoSeconds(input.seconds));
        return { ok: true as const };
      }),
    },
  };
}
