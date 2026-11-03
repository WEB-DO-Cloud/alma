import type { SecretStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { HonchoReasoningLevel } from "./honcho-client.js";
import { HONCHO_REASONING_LEVELS } from "./honcho-client.js";
import { createHonchoProvider, honchoWorkspaceId } from "./honcho-memory-provider.js";
import type { MemoryProviderResolver } from "./memory-provider-factory.js";
import { SpaceMemoryProviderResolver, toStringRecord } from "./memory-provider-factory.js";
import {
  assertPublicHonchoBaseUrlSync,
  isOwnerHonchoSettings,
  PUBLIC_HONCHO_MODE,
} from "./public-honcho-endpoint.js";

/** Scope saved while the server provider is on. It is not a user connection. */
export const DEPLOYMENT_MEMORY_SCOPE_SOURCE = "deployment-scope";

export type DeploymentMemoryScope = "isolated" | "shared";

/** What clients may see. The API key and base URL stay on the server. */
export type DeploymentMemoryPublic = {
  defaultScope: DeploymentMemoryScope;
};

type DeploymentMemory = DeploymentMemoryPublic & {
  baseUrl: string;
  apiKey: string;
  reasoningLevel: HonchoReasoningLevel;
};

type MemoryRow = {
  provider: string;
  settings: unknown;
  defaultMemoryScope: string | null;
  secret?: { id: string; ciphertext: string } | null;
};

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(`${name} is required when MEMORY_PROVIDER is set`);
  return trimmed;
}

/** Server-wide Honcho, or null when MEMORY_PROVIDER is unset. A partial config fails at boot. */
export function deploymentMemoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentMemory | null {
  const provider = env.MEMORY_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;
  if (provider !== "honcho") throw new Error("MEMORY_PROVIDER must be honcho");
  const baseUrl = required(env.HONCHO_BASE_URL, "HONCHO_BASE_URL");
  const apiKey = required(env.HONCHO_API_KEY, "HONCHO_API_KEY");
  const reasoningLevel = (env.HONCHO_REASONING_LEVEL?.trim() || "low") as HonchoReasoningLevel;
  if (!HONCHO_REASONING_LEVELS.includes(reasoningLevel)) {
    throw new Error(`HONCHO_REASONING_LEVEL must be one of ${HONCHO_REASONING_LEVELS.join(", ")}`);
  }
  const defaultScope = (env.MEMORY_DEFAULT_SCOPE?.trim() || "isolated") as DeploymentMemoryScope;
  if (defaultScope !== "isolated" && defaultScope !== "shared") {
    throw new Error("MEMORY_DEFAULT_SCOPE must be isolated or shared");
  }
  // The server's own Honcho is trusted, including a private address. No private-endpoint flag.
  createHonchoProvider({ mode: "local", baseUrl, reasoningLevel }, { apiKey });
  return { baseUrl, apiKey, reasoningLevel, defaultScope };
}

export function deploymentMemoryPublic(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentMemoryPublic | null {
  const memory = deploymentMemoryFromEnv(env);
  return memory ? { defaultScope: memory.defaultScope } : null;
}

function savedScope(
  value: string | null | undefined,
  fallback: DeploymentMemoryScope,
): DeploymentMemoryScope {
  return value === "shared" || value === "isolated" ? value : fallback;
}

function ownerCredentials(plaintext: string): Record<string, string> | null {
  try {
    const credentials = toStringRecord(JSON.parse(plaintext));
    return credentials.apiKey ? credentials : null;
  } catch {
    return null;
  }
}

/**
 * Uses a Space's own public Honcho when the owner saved one, otherwise the server Honcho.
 * An unreachable owner server skips semantic memory. It does not fail the chat, and it does
 * not fall back to writing that Space's facts into the server Honcho.
 */
export function createMemoryProviderResolver(
  prisma: Pick<PrismaClient, "spaceMemoryConfig">,
  secrets: SecretStore,
  env: NodeJS.ProcessEnv = process.env,
): MemoryProviderResolver {
  const inner = new SpaceMemoryProviderResolver(prisma, secrets);
  const deployment = deploymentMemoryFromEnv(env);
  const serverProvider = deployment
    ? createHonchoProvider(
        {
          mode: "local",
          baseUrl: deployment.baseUrl,
          reasoningLevel: deployment.reasoningLevel,
        },
        { apiKey: deployment.apiKey },
      )
    : null;

  return {
    async resolve(spaceId) {
      const row = (await prisma.spaceMemoryConfig.findUnique({
        where: { spaceId },
        include: { secret: true },
      })) as MemoryRow | null;
      const settings = toStringRecord(row?.settings);
      if (row && isOwnerHonchoSettings(settings)) {
        try {
          assertPublicHonchoBaseUrlSync(settings.baseUrl ?? "");
          const plaintext = await secrets.load(row.secret?.ciphertext ?? "", row.secret?.id ?? "");
          const credentials = ownerCredentials(plaintext);
          if (!credentials) return null;
          return {
            provider: createHonchoProvider(
              {
                mode: PUBLIC_HONCHO_MODE,
                baseUrl: settings.baseUrl ?? "",
                source: settings.source ?? "",
              },
              credentials,
            ),
            defaultScope: savedScope(
              row.defaultMemoryScope,
              deployment?.defaultScope ?? "isolated",
            ),
          };
        } catch (error) {
          getLogger().warn("Semantic memory skipped: owner Honcho is unavailable", {
            spaceId,
            workspaceId: honchoWorkspaceId(settings, spaceId),
            reason: error instanceof Error ? error.message : "unavailable",
          });
          return null;
        }
      }
      if (!deployment || !serverProvider) {
        if (settings.source === DEPLOYMENT_MEMORY_SCOPE_SOURCE) return null;
        return inner.resolve(spaceId);
      }
      return {
        provider: serverProvider,
        defaultScope: savedScope(row?.defaultMemoryScope, deployment.defaultScope),
      };
    },
  };
}
