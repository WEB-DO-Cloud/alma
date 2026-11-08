import { randomInt } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
  DEFAULT_SHARE_TEXT,
  readReferralPromptConfig,
  readReferralRewardsConfig,
} from "@rakazo/core";
import { isUniqueViolation } from "@rakazo/db";
import type { RouterContext } from "./context.js";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function newCode() {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function referralShareRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    referralShare: {
      get: authed.referralShare.get.handler(async ({ context }) => {
        if (!readReferralPromptConfig().enabled && !readReferralRewardsConfig().enabled) {
          throw new ORPCError("FORBIDDEN", { message: "referral_prompt_disabled" });
        }
        const member = await deps.prisma.member.findFirst({
          where: { userId: context.actor.userId, role: { contains: "owner" } },
          select: { organizationId: true },
        });
        if (!member) return { url: null, text: DEFAULT_SHARE_TEXT };
        let code = (
          await deps.prisma.referralCode.findUnique({
            where: { organizationId: member.organizationId },
          })
        )?.code;
        if (!code) {
          for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
            try {
              const created = await deps.prisma.referralCode.create({
                data: { organizationId: member.organizationId, code: newCode() },
              });
              code = created.code;
            } catch (error) {
              if (!isUniqueViolation(error)) throw error;
              code = (
                await deps.prisma.referralCode.findUnique({
                  where: { organizationId: member.organizationId },
                })
              )?.code;
            }
          }
        }
        return {
          url: code ? `${deps.env.webOrigin}/sign-up?ref=${code}` : null,
          text: DEFAULT_SHARE_TEXT,
        };
      }),
    },
  };
}
