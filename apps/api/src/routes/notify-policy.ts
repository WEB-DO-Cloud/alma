import { ORPCError } from "@orpc/server";
import { readNotifyPolicyConfig } from "@rakazo/core";
import { loadNotifyPolicy, saveNotifyPolicy } from "@rakazo/db";
import type { RouterContext } from "./context.js";

function requireNotifyPolicy(): void {
  if (!readNotifyPolicyConfig().enabled) {
    throw new ORPCError("FORBIDDEN", { message: "notify_policy_disabled" });
  }
}

export function notifyPolicyRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    notifyPolicy: {
      get: authed.notifyPolicy.get.handler(async ({ context }) => {
        requireNotifyPolicy();
        const policy = await loadNotifyPolicy(deps.prisma, context.actor.userId);
        return {
          channel: policy.channel,
          quietStartMinute: policy.quietStartMinute,
          quietEndMinute: policy.quietEndMinute,
        };
      }),
      update: authed.notifyPolicy.update.handler(async ({ context, input }) => {
        requireNotifyPolicy();
        const start = input.quietStartMinute;
        const end = input.quietEndMinute;
        if ((start === null) !== (end === null)) {
          throw new ORPCError("BAD_REQUEST", { message: "notify_policy_quiet" });
        }
        await saveNotifyPolicy(deps.prisma, context.actor.userId, {
          channel: input.channel,
          quietStartMinute: start,
          quietEndMinute: end,
        });
        return { ok: true as const };
      }),
    },
  };
}
