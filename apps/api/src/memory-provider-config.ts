import { ORPCError } from "@orpc/server";
import type { SecretStore } from "@rakazo/adapter-kit";
import type { ResolveHostname } from "@rakazo/adapters";
import {
  assertPublicHonchoBaseUrl,
  classifyMemoryProviderSettings,
  DEPLOYMENT_MEMORY_SCOPE_SOURCE,
  honchoWorkspaceId,
  isOwnerHonchoSettings,
  MemoryProviderPrivateEndpointRequiredError,
  memoryProviderRequiresPrivateEndpoint,
  normalizePublicHonchoBaseUrl,
  OWNER_HONCHO_SOURCE,
  PUBLIC_HONCHO_MODE,
  prepareMemoryProviderConnection,
  probePublicHoncho,
  publicHonchoErrorCode,
  samePublicHonchoBaseUrl,
  toStringRecord,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { findSpaceMemoryConfig, Prisma } from "@rakazo/db";
import { withSerializableRetry } from "./serializable-retry.js";

export interface MemoryProviderConfigDeps {
  prisma: PrismaClient;
  env?: {
    mcpAllowPrivateEndpoint?: boolean;
    deploymentMemory?: { defaultScope: "isolated" | "shared" } | null;
  };
  secrets: Pick<SecretStore, "put" | "load">;
  /** Test seam: DNS answers for an owner Honcho. Production resolves for real. */
  resolveHostname?: ResolveHostname;
  /** Test seam: override the owner Honcho workspace check. */
  probeOwnerHoncho?: typeof probePublicHoncho;
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

async function requireSpaceOwner(prisma: PrismaClient, actor: Actor): Promise<void> {
  const member = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: actor.spaceId, userId: actor.userId } },
    select: { role: true },
  });
  const roles = member?.role.split(",").map((role) => role.trim());
  if (!roles?.includes("owner")) throw new ORPCError("FORBIDDEN");
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

/** Owner view. The API key is never copied out of the secret store. */
export function ownerMemoryView(
  input: { settings: unknown; defaultMemoryScope: string; updatedAt?: Date },
  connectionWarning?: "unreachable",
): {
  provider: string;
  settings: Record<string, string>;
  defaultMemoryScope: "isolated" | "shared";
  updatedAt: string;
  managedByServer: true;
  ownerServer: true;
  connectionWarning?: "unreachable";
} {
  const settings = toStringRecord(input.settings);
  const scope = input.defaultMemoryScope === "shared" ? "shared" : "isolated";
  return {
    provider: "honcho",
    settings: {
      source: OWNER_HONCHO_SOURCE,
      baseUrl: settings.baseUrl ?? "",
    },
    defaultMemoryScope: scope,
    updatedAt: (input.updatedAt ?? new Date(0)).toISOString(),
    managedByServer: true,
    ownerServer: true,
    ...(connectionWarning ? { connectionWarning } : {}),
  };
}

function secretContext(actor: Actor) {
  return {
    operationId: "memory-provider-config",
    traceId: "memory-provider-config",
    spaceId: actor.spaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  };
}

function isOwnerHonchoInput(input: {
  provider: string;
  settings: Record<string, string>;
}): boolean {
  return (
    input.provider === "honcho" &&
    (input.settings.source === OWNER_HONCHO_SOURCE || input.settings.mode === PUBLIC_HONCHO_MODE)
  );
}

async function storedOwnerKey(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  baseUrl: string,
): Promise<string | null> {
  const existing = await deps.prisma.spaceMemoryConfig.findUnique({
    where: { spaceId: actor.spaceId },
    include: { secret: true },
  });
  if (!existing || !isOwnerHonchoSettings(toStringRecord(existing.settings))) return null;
  const savedUrl = toStringRecord(existing.settings).baseUrl ?? "";
  if (!samePublicHonchoBaseUrl(savedUrl, baseUrl)) return null;
  try {
    const plaintext = await deps.secrets.load(existing.secret.ciphertext, existing.secret.id);
    const apiKey = toStringRecord(JSON.parse(plaintext)).apiKey?.trim() ?? "";
    return apiKey || null;
  } catch {
    return null;
  }
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
  if (deploymentManaged(deps)) {
    if (!isOwnerHonchoInput(input)) refuseManagedProvider();
    return saveOwnerHoncho(deps, actor, input);
  }
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
  const config = await withSerializableRetry(() =>
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
  if (isOwnerHonchoSettings(toStringRecord(updated.settings))) return ownerMemoryView(updated);
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
  if (deploymentManaged(deps)) return revertOwnerHoncho(deps, actor);
  await requireSpaceOwner(deps.prisma, actor);
  await withSerializableRetry(() =>
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

async function ownerApiKey(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  baseUrl: string,
  submitted: string | undefined,
): Promise<string> {
  const apiKey = submitted?.trim() ?? "";
  if (apiKey) return apiKey;
  const stored = await storedOwnerKey(deps, actor, baseUrl);
  if (!stored) throw new ORPCError("BAD_REQUEST", { message: "missing-key" });
  return stored;
}

function ownerHonchoFailure(error: string): never {
  throw new ORPCError("BAD_REQUEST", { message: publicHonchoErrorCode(error) });
}

export async function saveOwnerHoncho(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  input: {
    settings: Record<string, string>;
    credentials: Record<string, string>;
    defaultMemoryScope: "isolated" | "shared";
  },
) {
  await requireSpaceOwner(deps.prisma, actor);
  const baseUrl = input.settings.baseUrl?.trim() ?? "";
  let apiKey: string;
  try {
    apiKey = await ownerApiKey(deps, actor, baseUrl, input.credentials.apiKey);
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    throw new ORPCError("BAD_REQUEST", { message: "missing-key" });
  }
  let normalized: string;
  try {
    normalized = normalizePublicHonchoBaseUrl(baseUrl);
    await assertPublicHonchoBaseUrl(normalized, deps.resolveHostname);
  } catch {
    throw new ORPCError("BAD_REQUEST", { message: "public-https" });
  }
  const probe = deps.probeOwnerHoncho ?? probePublicHoncho;
  const checked = await probe({
    baseUrl: normalized,
    apiKey,
    workspaceId: honchoWorkspaceId({}, actor.spaceId),
    resolveHostname: deps.resolveHostname,
  });
  if (!checked.ok) ownerHonchoFailure(checked.error);
  const stored = await deps.secrets.put(JSON.stringify({ apiKey }), secretContext(actor));
  const settings = {
    source: OWNER_HONCHO_SOURCE,
    mode: PUBLIC_HONCHO_MODE,
    baseUrl: normalized,
  };
  const config = await withSerializableRetry(() =>
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
            provider: "honcho",
            settings,
            secretId: secret.id,
            defaultMemoryScope: input.defaultMemoryScope,
          },
          update: {
            userId: actor.userId,
            provider: "honcho",
            settings,
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
  return ownerMemoryView(config);
}

/** Drop the owner key and return the Space to the server Honcho. The scope is kept. */
export async function revertOwnerHoncho(deps: MemoryProviderConfigDeps, actor: Actor) {
  await requireSpaceOwner(deps.prisma, actor);
  const existing = await deps.prisma.spaceMemoryConfig.findUnique({
    where: { spaceId: actor.spaceId },
  });
  if (!existing || !isOwnerHonchoSettings(toStringRecord(existing.settings))) {
    return { ok: true as const };
  }
  const stored = await deps.secrets.put("{}", secretContext(actor));
  await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const secret = await tx.secret.create({
          data: {
            id: stored.id,
            userId: actor.userId,
            spaceId: actor.spaceId,
            kind: "memory-provider",
            ciphertext: stored.ciphertext,
          },
        });
        await tx.spaceMemoryConfig.update({
          where: { id: existing.id },
          data: {
            provider: "honcho",
            settings: { source: DEPLOYMENT_MEMORY_SCOPE_SOURCE },
            secretId: secret.id,
          },
        });
        await tx.secret.deleteMany({ where: { id: existing.secretId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return { ok: true as const };
}

export async function probeOwnerHonchoConnection(
  deps: MemoryProviderConfigDeps,
  actor: Actor,
  input: { baseUrl: string; apiKey: string },
) {
  if (!deploymentManaged(deps)) throw new ORPCError("CONFLICT");
  await requireSpaceOwner(deps.prisma, actor);
  let normalized: string;
  try {
    normalized = normalizePublicHonchoBaseUrl(input.baseUrl);
    await assertPublicHonchoBaseUrl(normalized, deps.resolveHostname);
  } catch {
    return { ok: false as const, error: "public-https" as const };
  }
  const submitted = input.apiKey.trim();
  const apiKey = submitted || (await storedOwnerKey(deps, actor, normalized)) || "";
  if (!apiKey) return { ok: false as const, error: "missing-key" as const };
  const probe = deps.probeOwnerHoncho ?? probePublicHoncho;
  const checked = await probe({
    baseUrl: normalized,
    apiKey,
    workspaceId: honchoWorkspaceId({}, actor.spaceId),
    resolveHostname: deps.resolveHostname,
  });
  if (checked.ok) return { ok: true as const };
  return { ok: false as const, error: publicHonchoErrorCode(checked.error) };
}

export async function readMemoryProviderSettings(deps: MemoryProviderConfigDeps, spaceId: string) {
  const deployment = deps.env?.deploymentMemory;
  const config = await deps.prisma.spaceMemoryConfig.findUnique({
    where: { spaceId },
    include: { secret: true },
  });
  if (!deployment) return config ? serializeSpaceMemoryConfig(config) : null;
  const settings = toStringRecord(config?.settings);
  if (!config || !isOwnerHonchoSettings(settings)) {
    return managedMemoryView({
      defaultMemoryScope: config?.defaultMemoryScope ?? deployment.defaultScope,
      updatedAt: config?.updatedAt,
    });
  }
  let unreachable = false;
  try {
    const plaintext = await deps.secrets.load(config.secret.ciphertext, config.secret.id);
    const apiKey = toStringRecord(JSON.parse(plaintext)).apiKey ?? "";
    const probe = deps.probeOwnerHoncho ?? probePublicHoncho;
    const checked = apiKey
      ? await probe({
          baseUrl: settings.baseUrl ?? "",
          apiKey,
          workspaceId: honchoWorkspaceId(settings, spaceId),
          resolveHostname: deps.resolveHostname,
        })
      : { ok: false as const, error: "missing" };
    unreachable = !checked.ok;
  } catch {
    unreachable = true;
  }
  return ownerMemoryView(config, unreachable ? "unreachable" : undefined);
}
