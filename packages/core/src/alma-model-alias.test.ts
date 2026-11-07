import { describe, expect, it } from "vitest";
import {
  presentCatalogEntry,
  presentModelCopy,
  presentModelId,
  presentUsageIdentity,
  publicProviderLabel,
  resolveModelId,
  sameModelId,
  sanitizeUserModelError,
  toPublicModelId,
  toUpstreamModelId,
} from "./alma-model-alias.js";

describe("ALMA model aliases", () => {
  it("maps every deepseek- id to alma- and back", () => {
    const pairs = [
      ["deepseek-flash", "alma-flash"],
      ["deepseek-v4-pro", "alma-v4-pro"],
      ["deepseek-chat", "alma-chat"],
      ["deepseek-reasoner", "alma-reasoner"],
    ] as const;
    for (const [upstream, pub] of pairs) {
      expect(toPublicModelId(upstream)).toBe(pub);
      expect(toPublicModelId(pub)).toBe(pub);
      expect(toUpstreamModelId(pub)).toBe(upstream);
      expect(toUpstreamModelId(upstream)).toBe(upstream);
      expect(presentModelId("deepseek", upstream)).toBe(pub);
      expect(resolveModelId("deepseek", pub)).toBe(upstream);
      expect(sameModelId("deepseek", pub, upstream)).toBe(true);
    }
  });

  it("leaves other providers and unrelated ids alone", () => {
    expect(toPublicModelId("claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(resolveModelId("openrouter", "deepseek/deepseek-v4-pro")).toBe(
      "deepseek/deepseek-v4-pro",
    );
    expect(presentModelId("openai-compatible", "deepseek-chat")).toBe("deepseek-chat");
    expect(sameModelId("openai", "gpt-6-luna", "alma-flash")).toBe(false);
  });

  it("hides the vendor in labels, usage, and provider errors", () => {
    const entry = presentCatalogEntry({
      provider: "deepseek",
      providerName: "DeepSeek",
      id: "deepseek-flash",
      label: "DeepSeek V4.1 Flash",
      billing: "Uses your DeepSeek API key. ALMA does not pay for model usage.",
    });
    expect(entry).toMatchObject({
      provider: "deepseek",
      providerName: "ALMA",
      id: "alma-flash",
      label: "ALMA V4.1 Flash",
      billing: "Uses your ALMA API key. ALMA does not pay for model usage.",
    });
    expect(JSON.stringify(presentUsageIdentity("deepseek", "deepseek-flash"))).not.toMatch(
      /deepseek/i,
    );
    expect(presentUsageIdentity("deepseek", "deepseek-v4-pro")).toEqual({
      provider: "ALMA",
      model: "alma-v4-pro",
    });
    expect(sanitizeUserModelError("DeepSeek API error (429): slow down")).toBe(
      "ALMA model error (429): slow down",
    );
    expect(sanitizeUserModelError("deepseek API error (401): rejected")).toBe(
      "ALMA model error (401): rejected",
    );
    expect(presentModelCopy("DeepSeek API error: model deepseek-flash")).not.toMatch(/deepseek/i);
    expect(publicProviderLabel("deepseek")).toBe("ALMA");
    expect(publicProviderLabel("openai")).toBe("openai");
  });

  it("does not rewrite operator key names", () => {
    expect(presentModelCopy("Set DEEPSEEK_API_KEY for the host.")).toBe(
      "Set DEEPSEEK_API_KEY for the host.",
    );
  });
});
