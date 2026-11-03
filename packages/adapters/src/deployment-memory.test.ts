import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryProviderResolver,
  deploymentMemoryFromEnv,
  deploymentMemoryPublic,
} from "./deployment-memory.js";

const KEY = "honcho-admin-token";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MEMORY_PROVIDER: "honcho",
    HONCHO_BASE_URL: "http://honcho-api:8000",
    HONCHO_API_KEY: KEY,
    HONCHO_REASONING_LEVEL: "low",
    MEMORY_DEFAULT_SCOPE: "isolated",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deployment memory", () => {
  it("stays off until MEMORY_PROVIDER is set", () => {
    expect(deploymentMemoryFromEnv({})).toBeNull();
    expect(deploymentMemoryPublic({ HONCHO_API_KEY: KEY })).toBeNull();
  });

  it("accepts a private Honcho URL without MCP_ALLOW_PRIVATE_ENDPOINT", () => {
    vi.stubEnv("MCP_ALLOW_PRIVATE_ENDPOINT", "false");
    const memory = deploymentMemoryFromEnv(env());
    expect(memory?.baseUrl).toBe("http://honcho-api:8000");
    expect(memory?.reasoningLevel).toBe("low");
    expect(memory?.defaultScope).toBe("isolated");
    expect(deploymentMemoryPublic(env())).toEqual({ defaultScope: "isolated" });
    expect(JSON.stringify(deploymentMemoryPublic(env()))).not.toContain(KEY);
  });

  it("rejects a provider other than honcho and a short key", () => {
    expect(() => deploymentMemoryFromEnv(env({ MEMORY_PROVIDER: "serenity" }))).toThrow(
      "MEMORY_PROVIDER must be honcho",
    );
    expect(() => deploymentMemoryFromEnv(env({ HONCHO_API_KEY: "short" }))).toThrow(/apiKey/);
  });

  it("uses the server provider unless the Space saved its own Honcho", async () => {
    const scopes = new Map<string, string>([["space-a", "shared"]]);
    const prisma = {
      spaceMemoryConfig: {
        findUnique: vi.fn(async ({ where }: { where: { spaceId: string } }) => {
          const scope = scopes.get(where.spaceId);
          return scope ? { defaultMemoryScope: scope, settings: { mode: "cloud" } } : null;
        }),
      },
    };
    const secrets = { load: vi.fn(async () => JSON.stringify({ apiKey: "user-key-value" })) };
    const resolver = createMemoryProviderResolver(
      prisma as never,
      secrets as never,
      env({ MEMORY_DEFAULT_SCOPE: "isolated" }),
    );

    const shared = await resolver.resolve("space-a");
    const fresh = await resolver.resolve("space-b");
    expect(shared?.defaultScope).toBe("shared");
    expect(fresh?.defaultScope).toBe("isolated");
    expect(shared?.provider).toBe(fresh?.provider);
    expect(secrets.load).not.toHaveBeenCalled();
  });

  it("prefers a Space's public Honcho over the server provider", async () => {
    vi.stubEnv("MCP_ALLOW_PRIVATE_ENDPOINT", "true");
    const ownerKey = "owner-honcho-key";
    const prisma = {
      spaceMemoryConfig: {
        findUnique: vi.fn(async ({ where }: { where: { spaceId: string } }) =>
          where.spaceId === "space-own"
            ? {
                provider: "honcho",
                defaultMemoryScope: "shared",
                settings: {
                  source: "owner-honcho",
                  mode: "public",
                  baseUrl: "https://memory.example.test",
                },
                secret: { id: "secret-1", ciphertext: "cipher" },
              }
            : null,
        ),
      },
    };
    const secrets = { load: vi.fn(async () => JSON.stringify({ apiKey: ownerKey })) };
    const resolver = createMemoryProviderResolver(prisma as never, secrets as never, env());
    const own = await resolver.resolve("space-own");
    const server = await resolver.resolve("space-other");
    expect(own?.defaultScope).toBe("shared");
    expect(own?.provider).not.toBe(server?.provider);
    expect(own?.provider.describe().id).toBe("honcho");
    expect(secrets.load).toHaveBeenCalledWith("cipher", "secret-1");
  });

  it("skips an owner Honcho on a private address without failing the chat", async () => {
    vi.stubEnv("MCP_ALLOW_PRIVATE_ENDPOINT", "true");
    const prisma = {
      spaceMemoryConfig: {
        findUnique: vi.fn(async () => ({
          provider: "honcho",
          defaultMemoryScope: "isolated",
          settings: {
            source: "owner-honcho",
            mode: "public",
            baseUrl: "https://10.0.0.8",
          },
          secret: { id: "secret-1", ciphertext: "cipher" },
        })),
      },
    };
    const secrets = { load: vi.fn(async () => JSON.stringify({ apiKey: "owner-honcho-key" })) };
    const resolver = createMemoryProviderResolver(prisma as never, secrets as never, env());
    await expect(resolver.resolve("space-own")).resolves.toBeNull();
    expect(secrets.load).not.toHaveBeenCalled();
  });

  it("ignores a scope-only row when the server provider is off", async () => {
    const prisma = {
      spaceMemoryConfig: {
        findUnique: vi.fn(async () => ({
          settings: { source: "deployment-scope" },
          secret: { ciphertext: "cipher" },
          provider: "honcho",
          defaultMemoryScope: "shared",
        })),
      },
    };
    const secrets = { load: vi.fn() };
    const resolver = createMemoryProviderResolver(prisma as never, secrets as never, {});
    await expect(resolver.resolve("space-a")).resolves.toBeNull();
    expect(secrets.load).not.toHaveBeenCalled();
  });
});
