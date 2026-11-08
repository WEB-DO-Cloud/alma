import { ORPCError } from "@orpc/server";
import { readDigestConfig } from "@rakazo/core";
import { digestSettings, latestDigestIssues, saveDigestSettings } from "@rakazo/db";
import type { RouterContext } from "./context.js";

function requireDigest(): void {
  if (!readDigestConfig().enabled) throw new ORPCError("FORBIDDEN", { message: "digest_disabled" });
}

export function digestRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    digest: {
      get: authed.digest.get.handler(async ({ context }) => {
        requireDigest();
        const [settings, issues] = await Promise.all([
          digestSettings(deps.prisma, context.actor.userId),
          latestDigestIssues(deps.prisma, context.actor.userId),
        ]);
        return {
          ...settings,
          channel: "app_and_push" as const,
          issues: issues.map((issue) => ({
            kind: issue.kind === "weekly" ? ("weekly" as const) : ("daily" as const),
            localDate: issue.localDate,
            draftCount: issue.draftCount,
            reminderCount: issue.reminderCount,
          })),
        };
      }),
      update: authed.digest.update.handler(async ({ context, input }) => {
        requireDigest();
        await saveDigestSettings(deps.prisma, context.actor.userId, input);
        return { ok: true as const };
      }),
    },
  };
}
