import { describe, expect, it, vi } from "vitest";
import { resolveModelKey } from "./run-model.js";

const MANAGED = { provider: "xai", id: "subscription-default" };

function deps(mode: string | null) {
  const upsert = vi.fn(async () => ({ mode, balanceMicros: 0n }));
  return {
    upsert,
    deps: {
      billingEnabled: true,
      runtime: { describe: () => ({ capabilities: { managed: MANAGED } }) },
      prisma: {
        space: {
          findFirst: async () => ({ organization: { modelCredits: { mode, balanceMicros: 0n } } }),
          findUnique: async () => ({ organizationId: "org" }),
        },
        member: { findUnique: async () => ({ role: "owner" }) },
        modelCreditAccount: { upsert },
        userModelCredential: { findFirst: async () => null },
      },
    } as unknown as Parameters<typeof resolveModelKey>[0],
  };
}

describe("ALMA managed model and model credits", () => {
  it.each([null, "byok"])(
    "runs the managed model without a credit gate when funding is %s",
    async (mode) => {
      const { deps: d, upsert } = deps(mode);
      const resolved = await resolveModelKey(
        d,
        "user",
        "space",
        null,
        MANAGED.provider,
        MANAGED.id,
      );
      expect(resolved.callObserver).toBeUndefined();
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it("still gates a deployment model the managed runtime does not serve", async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-deployment-key");
    try {
      const { deps: d } = deps("byok");
      const withKey = { ...d, deploymentModelKey: "fixture-deployment-key" } as typeof d;
      await expect(
        resolveModelKey(withKey, "user", "space", null, "openrouter", "openai/gpt-6-luna"),
      ).rejects.toThrow("Connect your own API key");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
