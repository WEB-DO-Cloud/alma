import { recordActivationEvent } from "./alma-activation.js";
import { readAlmaFlags } from "./alma-flags.js";
import { hasModelAccess } from "./billing.js";
import type { Prisma, PrismaClient } from "./client.js";

export type TrialAdmit = "ok" | "limit";

/**
 * Counts one user message that is about to queue a model run.
 * `limit` means the trial row exists and cannot accept another message.
 * A subscription, complimentary period, or credit balance does not consume the cap.
 */
export async function admitUserRun(
  tx: Prisma.TransactionClient,
  input: { spaceId: string; userId: string; messageId: string },
): Promise<TrialAdmit> {
  const flags = readAlmaFlags();
  if (!flags.trialEnabled && !flags.onboardingV2) return "ok";
  const space = await tx.space.findUnique({
    where: { id: input.spaceId },
    select: {
      organizationId: true,
      organization: {
        select: {
          modelCredits: { select: { mode: true, balanceMicros: true, byokFreeUntil: true } },
          billing: { select: { status: true, subscriptionId: true } },
          almaTrial: true,
          almaProfile: { select: { sector: true, use: true } },
        },
      },
    },
  });
  if (!space) return "ok";
  const { organizationId, organization } = space;
  const credits = organization.modelCredits ?? {
    mode: null,
    balanceMicros: 0n,
    byokFreeUntil: null,
  };
  const covered = hasModelAccess(credits, organization.billing?.status ?? null);
  if (!covered && flags.trialEnabled && organization.almaTrial) {
    const updated = await tx.$queryRaw<Array<{ messagesUsed: number }>>`
      UPDATE alma_trials
      SET "messagesUsed" = "messagesUsed" + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "organizationId" = ${organizationId}
        AND "endsAt" > CURRENT_TIMESTAMP
        AND "messagesUsed" < "messageCap"
      RETURNING "messagesUsed"`;
    if (updated.length === 0) return "limit";
  }
  await recordActivationEvent(tx, {
    organizationId,
    userId: input.userId,
    name: "task_started",
    dedupeKey: `task_started:${input.messageId}`,
    sector: organization.almaProfile?.sector,
    use: organization.almaProfile?.use,
  });
  return "ok";
}

/** Inserts the one trial for an eligible organization. A second call inserts nothing. */
export async function ensureAlmaTrial(
  prisma: PrismaClient,
  input: { organizationId: string; userId: string },
): Promise<void> {
  const flags = readAlmaFlags();
  if (!flags.trialEnabled) return;
  const inserted = await prisma.$queryRaw<Array<{ organizationId: string }>>`
    INSERT INTO alma_trials (
      "organizationId", "startedAt", "endsAt", "messageCap", "messagesUsed", "createdAt", "updatedAt"
    )
    SELECT ${input.organizationId},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP + make_interval(days => ${flags.trialDays}::int),
      ${flags.trialMessageCap}::int,
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM alma_trials t WHERE t."organizationId" = ${input.organizationId})
      AND NOT EXISTS (
        SELECT 1 FROM billing_accounts b
        WHERE b."organizationId" = ${input.organizationId}
          AND (b.status IN ('trialing', 'active', 'past_due') OR b."subscribedAt" IS NOT NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM model_credit_accounts c
        WHERE c."organizationId" = ${input.organizationId}
          AND (c."byokFreeUntil" IS NOT NULL OR c.mode = 'byok' OR c."balanceMicros" > 0)
      )
    ON CONFLICT ("organizationId") DO NOTHING
    RETURNING "organizationId"`;
  if (inserted.length === 0) return;
  await recordActivationEvent(prisma, {
    organizationId: input.organizationId,
    userId: input.userId,
    name: "signup",
    dedupeKey: `signup:${input.organizationId}`,
  });
}

export function trialCountdown(
  trial: {
    endsAt: Date;
    messagesUsed: number;
    messageCap: number;
  } | null,
  now = new Date(),
) {
  if (!trial) return null;
  const remainingMs = trial.endsAt.getTime() - now.getTime();
  return {
    endsAt: trial.endsAt.toISOString(),
    messagesUsed: trial.messagesUsed,
    messageCap: trial.messageCap,
    daysLeft: remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 86_400_000),
    messagesLeft: Math.max(0, trial.messageCap - trial.messagesUsed),
  };
}

/** Writes the cap or clock funnel row after a refused send has rolled back. */
export async function noteTrialCap(
  prisma: PrismaClient,
  input: { spaceId: string; userId: string },
): Promise<void> {
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: {
      organizationId: true,
      organization: {
        select: {
          almaTrial: true,
          almaProfile: { select: { sector: true, use: true } },
        },
      },
    },
  });
  const trial = space?.organization.almaTrial;
  if (!space || !trial) return;
  const expired = trial.endsAt <= new Date();
  await recordActivationEvent(prisma, {
    organizationId: space.organizationId,
    userId: input.userId,
    name: "limit_reached",
    dedupeKey: `limit_reached:${space.organizationId}:${expired ? "time" : "cap"}`,
    sector: space.organization.almaProfile?.sector,
    use: space.organization.almaProfile?.use,
  });
}

/** Writes the time-expiry funnel row once when status is read after the clock runs out. */
export async function noteTrialClock(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    endsAt: Date;
    sector?: string | null;
    use?: string | null;
  },
  now = new Date(),
): Promise<void> {
  if (!readAlmaFlags().trialEnabled || input.endsAt > now) return;
  await recordActivationEvent(prisma, {
    organizationId: input.organizationId,
    userId: input.userId,
    name: "limit_reached",
    dedupeKey: `limit_reached:${input.organizationId}:time`,
    sector: input.sector,
    use: input.use,
  });
}
