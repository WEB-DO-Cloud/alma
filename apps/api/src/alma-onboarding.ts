import { ORPCError } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { AlmaSectorChoiceSchema } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import {
  loadChecklist,
  organizationForMember,
  readAlmaFlags,
  recordActivationEvent,
  saveSectorChoice,
  sectorChoiceState,
  setChecklistDismissed,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";

type Deps = { prisma: PrismaClient };

export async function almaMeFields(deps: Deps, actor: Actor) {
  try {
    return await sectorChoiceState(deps.prisma, actor);
  } catch (error) {
    getLogger().error("sector choice", error);
    return {
      onboardingV2: readAlmaFlags().onboardingV2,
      needsSectorChoice: false,
      almaUse: null,
      almaSector: null,
      almaProfileSource: null,
    };
  }
}

export function almaOnboarding(deps: Deps) {
  return {
    async sector(actor: Actor, input: unknown) {
      if (!readAlmaFlags().onboardingV2) throw new ORPCError("NOT_FOUND");
      const parsed = AlmaSectorChoiceSchema.parse(input);
      try {
        const saved = await saveSectorChoice(deps.prisma, actor, parsed);
        return { ok: true as const, botId: saved.botId };
      } catch (error) {
        if (error instanceof Error && error.name === "AlmaForbidden") {
          throw new ORPCError("FORBIDDEN");
        }
        throw error;
      }
    },
    async checklist(actor: Actor) {
      return loadChecklist(deps.prisma, actor);
    },
    async checklistDismiss(actor: Actor) {
      return setChecklistDismissed(deps.prisma, actor, true);
    },
    async checklistReopen(actor: Actor) {
      return setChecklistDismissed(deps.prisma, actor, false);
    },
    async event(actor: Actor) {
      const org = await organizationForMember(deps.prisma, actor);
      if (!org) throw new ORPCError("FORBIDDEN");
      const day = new Date().toISOString().slice(0, 10);
      const profile = await deps.prisma.almaProfile.findUnique({
        where: { organizationId: org.organizationId },
        select: { sector: true, use: true },
      });
      await recordActivationEvent(deps.prisma, {
        organizationId: org.organizationId,
        userId: actor.userId,
        name: "plan_viewed",
        dedupeKey: `plan_viewed:${org.organizationId}:${day}`,
        sector: profile?.sector,
        use: profile?.use,
      });
      return { ok: true as const };
    },
  };
}
