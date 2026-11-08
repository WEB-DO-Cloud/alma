import type { Actor, AlmaChecklist } from "@rakazo/contracts";
import {
  almaCatalogNames,
  almaInstructions,
  almaLanguage,
  almaSector,
  almaText,
} from "@rakazo/contracts";
import { readReferralPromptConfig } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import { readAlmaFlags } from "./alma-flags.js";
import { organizationForMember, spaceHasNonTrialModelAccess } from "./billing.js";
import type { Prisma, PrismaClient } from "./client.js";
import { Prisma as PrismaNamespace } from "./client.js";
import { createRepos } from "./repos.js";

export async function recordActivationEvent(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    dedupeKey: string;
    sector?: string | null;
    use?: string | null;
  },
): Promise<void> {
  if (readAlmaFlags().trialEnabled || readAlmaFlags().onboardingV2) {
    try {
      await prisma.activationEvent.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          name: input.name,
          dedupeKey: input.dedupeKey,
          sector: input.sector ?? null,
          use: input.use ?? null,
        },
      });
    } catch (error) {
      if (
        !(error instanceof PrismaNamespace.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        getLogger().error("activation event", error);
      }
    }
  }
  if (!readReferralPromptConfig().enabled) return;
  const stamp = new Date();
  if (input.name === "task_completed") {
    await prisma.referral.updateMany({
      where: { organizationId: input.organizationId, activatedAt: null },
      data: { activatedAt: stamp },
    });
  }
  if (input.name === "payment_completed") {
    await prisma.referral.updateMany({
      where: { organizationId: input.organizationId, paidAt: null },
      data: { paidAt: stamp },
    });
  }
}

export async function sectorChoiceState(
  prisma: PrismaClient,
  actor: Actor,
): Promise<{
  onboardingV2: boolean;
  needsSectorChoice: boolean;
  almaUse: "personal" | "work" | "skip" | null;
  almaSector: string | null;
  almaProfileSource: "choice" | "existing" | null;
}> {
  const empty = {
    onboardingV2: false,
    needsSectorChoice: false,
    almaUse: null,
    almaSector: null,
    almaProfileSource: null,
  } as const;
  if (!readAlmaFlags().onboardingV2) return empty;
  const org = await organizationForMember(prisma, actor);
  if (!org) return { ...empty, onboardingV2: true };
  const profile = await prisma.almaProfile.findUnique({
    where: { organizationId: org.organizationId },
  });
  if (profile) {
    return {
      onboardingV2: true,
      needsSectorChoice: false,
      almaUse:
        profile.use === "personal" || profile.use === "work" || profile.use === "skip"
          ? profile.use
          : null,
      almaSector: profile.sector,
      almaProfileSource:
        profile.source === "choice" || profile.source === "existing" ? profile.source : null,
    };
  }
  const [nonTrialAccess, userMessages] = await Promise.all([
    spaceHasNonTrialModelAccess(prisma, actor.spaceId),
    prisma.message.count({
      where: {
        role: "user",
        thread: {
          space: { organizationId: org.organizationId },
          bot: { kind: { not: "support" } },
        },
      },
    }),
  ]);
  if (nonTrialAccess || userMessages > 0) {
    await prisma.almaProfile
      .create({
        data: {
          organizationId: org.organizationId,
          userId: actor.userId,
          use: "skip",
          sector: null,
          source: "existing",
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          return;
        throw error;
      });
    return {
      onboardingV2: true,
      needsSectorChoice: false,
      almaUse: "skip",
      almaSector: null,
      almaProfileSource: "existing",
    };
  }
  return {
    onboardingV2: true,
    needsSectorChoice: true,
    almaUse: null,
    almaSector: null,
    almaProfileSource: null,
  };
}

export async function saveSectorChoice(
  prisma: PrismaClient,
  actor: Actor,
  input: { use: "personal" | "work" | "skip"; sector?: string },
): Promise<{ botId: string | null }> {
  const org = await organizationForMember(prisma, actor);
  if (!org?.isOwner) {
    const error = new Error("forbidden");
    error.name = "AlmaForbidden";
    throw error;
  }
  const language = almaLanguage(
    (
      await prisma.user.findUnique({
        where: { id: actor.userId },
        select: { locale: true },
      })
    )?.locale,
  );
  const sectorId =
    input.use === "personal" ? "personal" : input.use === "work" ? (input.sector ?? null) : null;
  const sector = almaSector(sectorId);
  const use = input.use;
  await prisma.almaProfile.upsert({
    where: { organizationId: org.organizationId },
    create: {
      organizationId: org.organizationId,
      userId: actor.userId,
      use,
      sector: sectorId,
      source: "choice",
    },
    update: {
      userId: actor.userId,
      use,
      sector: sectorId,
      source: "choice",
    },
  });
  await prisma.signupSurvey.upsert({
    where: { userId: actor.userId },
    create: { userId: actor.userId, use: use === "skip" ? null : use },
    update: {},
  });
  await recordActivationEvent(prisma, {
    organizationId: org.organizationId,
    userId: actor.userId,
    name: "sector_chosen",
    dedupeKey: `sector_chosen:${org.organizationId}:${use}:${sectorId ?? "none"}`,
    sector: sectorId,
    use,
  });
  if (!sector) return { botId: null };
  const botId = await applySectorBot(prisma, actor, {
    organizationId: org.organizationId,
    name: almaText(sector.botName, language),
    instructions: almaInstructions(almaText(sector.botName, language), language),
    sectorId,
    use,
  });
  return { botId };
}

async function applySectorBot(
  prisma: PrismaClient,
  actor: Actor,
  input: {
    organizationId: string;
    name: string;
    instructions: string;
    sectorId: string | null;
    use: string;
  },
): Promise<string> {
  const existing = await prisma.bot.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId, kind: "standard", archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, instructions: true, spawnKey: true },
  });
  const names = almaCatalogNames();
  const current = existing.find((bot) => bot.spawnKey === "onboarding:first") ?? existing[0];
  const profile = await prisma.almaProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { appliedInstructions: true },
  });
  if (!current) {
    const created = await createRepos(prisma).createBot(actor, {
      name: input.name,
      description: "",
      instructions: input.instructions,
      notifyOnFinish: true,
      spawnKey: "onboarding:first",
      attachComputer: false,
    });
    await prisma.almaProfile.update({
      where: { organizationId: input.organizationId },
      data: { appliedInstructions: input.instructions },
    });
    await recordActivationEvent(prisma, {
      organizationId: input.organizationId,
      userId: actor.userId,
      name: "assistant_ready",
      dedupeKey: `assistant_ready:${input.organizationId}:${input.sectorId ?? "none"}`,
      sector: input.sectorId,
      use: input.use,
    });
    return created.id;
  }
  const mayRewrite =
    profile?.appliedInstructions == null
      ? current.instructions === ""
      : current.instructions === profile.appliedInstructions;
  await prisma.bot.update({
    where: { id: current.id },
    data: {
      ...(names.has(current.name) ? { name: input.name } : {}),
      ...(mayRewrite ? { instructions: input.instructions } : {}),
      spawnKey: current.spawnKey ?? "onboarding:first",
    },
  });
  if (mayRewrite) {
    await prisma.almaProfile.update({
      where: { organizationId: input.organizationId },
      data: { appliedInstructions: input.instructions },
    });
  }
  await recordActivationEvent(prisma, {
    organizationId: input.organizationId,
    userId: actor.userId,
    name: "assistant_ready",
    dedupeKey: `assistant_ready:${input.organizationId}:${input.sectorId ?? "none"}`,
    sector: input.sectorId,
    use: input.use,
  });
  return current.id;
}

export async function loadChecklist(prisma: PrismaClient, actor: Actor): Promise<AlmaChecklist> {
  const hidden = { visible: false, dismissed: false, steps: [] as AlmaChecklist["steps"] };
  if (!readAlmaFlags().onboardingV2) return hidden;
  const org = await organizationForMember(prisma, actor);
  if (!org) return hidden;
  const profile = await prisma.almaProfile.findUnique({
    where: { organizationId: org.organizationId },
  });
  if (profile?.source !== "choice") return hidden;
  const [connections, messaging, files, tasks] = await Promise.all([
    prisma.connection.findMany({
      where: { spaceId: actor.spaceId, status: "connected" },
      select: { provider: true, connectorId: true },
    }),
    prisma.messagingInstallation.count({ where: { spaceId: actor.spaceId } }),
    prisma.artifact.count({ where: { spaceId: actor.spaceId } }),
    prisma.message.count({
      where: {
        role: "user",
        thread: { spaceId: actor.spaceId, bot: { kind: { not: "support" } } },
      },
    }),
  ]);
  const blobs = connections.map((row) => `${row.provider} ${row.connectorId}`.toLowerCase());
  const calendar = blobs.some((value) => value.includes("calendar"));
  const email =
    messaging > 0 || blobs.some((value) => value.includes("gmail") || value.includes("outlook"));
  return {
    visible: profile.checklistDismissedAt == null,
    dismissed: profile.checklistDismissedAt != null,
    steps: [
      {
        id: "assistant",
        done: profile.use === "personal" || (profile.use === "work" && profile.sector != null),
      },
      { id: "calendar", done: calendar },
      { id: "email", done: email },
      { id: "file", done: files > 0 },
      { id: "task", done: tasks > 0 },
    ],
  };
}

export async function setChecklistDismissed(
  prisma: PrismaClient,
  actor: Actor,
  dismissed: boolean,
): Promise<AlmaChecklist> {
  const org = await organizationForMember(prisma, actor);
  if (org) {
    await prisma.almaProfile.updateMany({
      where: { organizationId: org.organizationId, source: "choice" },
      data: { checklistDismissedAt: dismissed ? new Date() : null },
    });
  }
  return loadChecklist(prisma, actor);
}

/** After a run is marked completed, record the funnel row when that run's message was counted. */
export async function recordTaskCompleted(prisma: PrismaClient, runId: string): Promise<void> {
  if (!readAlmaFlags().trialEnabled && !readAlmaFlags().onboardingV2) return;
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { sourceMessageId: true, userId: true, spaceId: true, status: true },
  });
  if (!run?.sourceMessageId || !run.userId || run.status !== "completed") return;
  const started = await prisma.activationEvent.findFirst({
    where: { dedupeKey: `task_started:${run.sourceMessageId}` },
    select: { id: true },
  });
  if (!started) return;
  const space = await prisma.space.findUnique({
    where: { id: run.spaceId },
    select: { organizationId: true },
  });
  if (!space) return;
  const profile = await prisma.almaProfile.findUnique({
    where: { organizationId: space.organizationId },
    select: { sector: true, use: true },
  });
  await recordActivationEvent(prisma, {
    organizationId: space.organizationId,
    userId: run.userId,
    name: "task_completed",
    dedupeKey: `task_completed:${runId}`,
    sector: profile?.sector,
    use: profile?.use,
  });
}
