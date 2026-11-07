import { ORPCError } from "@orpc/server";
import type { SecretStore } from "@rakazo/adapter-kit";
import {
  classifyMemoryProviderSettings,
  DEPLOYMENT_MEMORY_SCOPE_SOURCE,
  MemoryProviderPrivateEndpointRequiredError,
  memoryProviderRequiresPrivateEndpoint,
  prepareMemoryProviderConnection,
  toStringRecord,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { findSpaceMemoryConfig, Prisma, requireSpaceOwner, withTransactionRetry } from "@rakazo/db";

export interface MemoryProviderConfigDeps {
  prisma: PrismaClient;
  env?: {
    mcpAllowPrivateEndpoint?: boolean;
    deploymentMemory?: { defaultScope: "isolated" | "shared" } | null;
  };
  secrets: Pick<SecretStore, "put">;
  /** Test seam: override DNS/trust classification without probing. */
  classifySettings?: (
    provider: string,
    settings: Record<string, string>,
  ) => Promise<Record<string, string>>;
  /** Test seam: override prepare/probe. */
  prepareConnection?: (
    input: Parameters<typeof prepareMemoryProviderConnection>[0],
  ) => ReturnType<typeof prepareMemoryProviderConnection>;
}

function deploymentManaged(deps: MemoryProviderConfigDeps): boolean {
  return Boolean(deps.env?.deploymentMemory);
}

function refuseManagedProvider(): never {
  throw new ORPCError("CONFLICT", { message: "Memory is managed by ALMA" });
}

export function managedMemoryView(input: { defaultMemoryScope: string; updatedAt?: Date }): {
  provider: string;
  settings: Record<string, string>;
  defaultMemoryScope: "isolated" | "shared";
  updatedAt: string;
  managedByServer: true;
} {
  return {
    provider: "honcho",
    settings: {},
    defaultMemoryScope: input.defaultMemoryScope === "shared" ? "shared" : "isolated",
    updatedAt: (input.updatedAt ?? new Date(0)).toISOString(),
    managedByServer: true,
  };
}

export async function persistMemoryProviderConfig(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  input: {
    provider: string;
    settings: Record<string, string>;
    credentials: Record<string, string>;
    defaultMemoryScope: "isolated" | "shared";
  },
) {
  if (deploymentManaged(deps)) refuseManagedProvider();
  await requireSpaceOwner(deps.prisma, actor);
  let prepared: Awaited<ReturnType<typeof prepareMemoryProviderConnection>>;
  try {
    if (
      memoryProviderRequiresPrivateEndpoint(input.provider, input.settings) &&
      deps.env?.mcpAllowPrivateEndpoint !== true
    ) {
      throw new ORPCError("FORBIDDEN");
    }
    const classify = deps.classifySettings ?? classifyMemoryProviderSettings;
    const prepare = deps.prepareConnection ?? prepareMemoryProviderConnection;
    // Classify DNS/trust before any credentialed probe so LAN endpoints stay operator-authorized.
    const classifiedSettings = await classify(input.provider, input.settings);
    if (
      memoryProviderRequiresPrivateEndpoint(input.provider, classifiedSettings) &&
      deps.env?.mcpAllowPrivateEndpoint !== true
    ) {
      throw new ORPCError("FORBIDDEN");
    }
    prepared = await prepare({
      ...input,
      settings: classifiedSettings,
      allowPrivateEndpoint: deps.env?.mcpAllowPrivateEndpoint === true,
    });
    // Defense in depth if prepare reclassified further.
    if (
      memoryProviderRequiresPrivateEndpoint(prepared.provider, prepared.settings) &&
      deps.env?.mcpAllowPrivateEndpoint !== true
    ) {
      throw new ORPCError("FORBIDDEN");
    }
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    if (error instanceof MemoryProviderPrivateEndpointRequiredError) {
      throw new ORPCError("FORBIDDEN");
    }
    throw new ORPCError("BAD_REQUEST", {
      message: error instanceof Error ? error.message : "Memory provider connection failed",
    });
  }
  const stored = await deps.secrets.put(JSON.stringify(prepared.credentials), {
    operationId: "memory-provider-config",
    traceId: "memory-provider-config",
    spaceId: actor.spaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  });
  const config = await withTransactionRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const existing = await findSpaceMemoryConfig(tx, actor.spaceId);
        const secret = await tx.secret.create({
          data: {
            id: stored.id,
            userId: actor.userId,
            spaceId: actor.spaceId,
            kind: "memory-provider",
            ciphertext: stored.ciphertext,
          },
        });
        const updated = await tx.spaceMemoryConfig.upsert({
          where: { spaceId: actor.spaceId },
          create: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            provider: prepared.provider,
            settings: prepared.settings,
            secretId: secret.id,
            defaultMemoryScope: input.defaultMemoryScope,
          },
          update: {
            userId: actor.userId,
            provider: prepared.provider,
            settings: prepared.settings,
            secretId: secret.id,
            defaultMemoryScope: input.defaultMemoryScope,
          },
        });
        if (existing && existing.secretId !== secret.id) {
          await tx.secret.deleteMany({ where: { id: existing.secretId } });
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return serializeSpaceMemoryConfig(config);
}

export async function updateMemoryProviderDefaultScope(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  defaultMemoryScope: "isolated" | "shared",
) {
  await requireSpaceOwner(deps.prisma, actor);
  const existing = await findSpaceMemoryConfig(deps.prisma, actor.spaceId);
  if (!existing) {
    if (!deploymentManaged(deps)) throw new ORPCError("NOT_FOUND");
    const stored = await deps.secrets.put("{}", {
      operationId: "memory-provider-config",
      traceId: "memory-provider-config",
      spaceId: actor.spaceId,
      userId: actor.userId,
      signal: new AbortController().signal,
    });
    await deps.prisma.secret.create({
      data: {
        id: stored.id,
        userId: actor.userId,
        spaceId: actor.spaceId,
        kind: "memory-provider",
        ciphertext: stored.ciphertext,
      },
    });
    const created = await deps.prisma.spaceMemoryConfig.create({
      data: {
        spaceId: actor.spaceId,
        userId: actor.userId,
        provider: "honcho",
        settings: { source: DEPLOYMENT_MEMORY_SCOPE_SOURCE },
        secretId: stored.id,
        defaultMemoryScope,
      },
    });
    return managedMemoryView(created);
  }
  const updated = await deps.prisma.spaceMemoryConfig.update({
    where: { id: existing.id },
    data: { defaultMemoryScope },
  });
  if (deploymentManaged(deps)) return managedMemoryView(updated);
  return serializeSpaceMemoryConfig(updated);
}

export function serializeSpaceMemoryConfig(config: {
  provider: string;
  settings: unknown;
  defaultMemoryScope: string;
  updatedAt: Date;
}) {
  return {
    provider: config.provider,
    settings: toStringRecord(config.settings),
    defaultMemoryScope: config.defaultMemoryScope as "isolated" | "shared",
    updatedAt: config.updatedAt.toISOString(),
  };
}

export async function disconnectMemoryProvider(deps: MemoryProviderConfigDeps, actor: Actor) {
  if (deploymentManaged(deps)) refuseManagedProvider();
  await requireSpaceOwner(deps.prisma, actor);
  await withTransactionRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const existing = await findSpaceMemoryConfig(tx, actor.spaceId);
        if (!existing) return;
        await tx.spaceMemoryConfig.delete({ where: { id: existing.id } });
        await tx.secret.deleteMany({ where: { id: existing.secretId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return { ok: true as const };
}
