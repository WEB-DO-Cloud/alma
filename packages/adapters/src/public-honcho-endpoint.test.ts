import type { AdapterContext } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { HonchoMemoryProvider, probePublicHoncho } from "./honcho-memory-provider.js";
import type { ResolveHostname } from "./network-address.js";
import {
  assertPublicHonchoBaseUrl,
  fetchPublicHoncho,
  PUBLIC_HONCHO_ERRORS,
} from "./public-honcho-endpoint.js";

const publicResolver: ResolveHostname = async () => [{ address: "203.0.113.10", family: 4 }];
const privateResolver: ResolveHostname = async () => [{ address: "10.1.2.3", family: 4 }];

const context: AdapterContext = {
  operationId: "op-1",
  traceId: "trace-1",
  spaceId: "space-1",
  userId: "user-1",
  botId: "bot-1",
  signal: new AbortController().signal,
};

describe("public Honcho addresses", () => {
  it.each([
    "http://memory.example.test",
    "https://127.0.0.1",
    "https://10.0.0.8",
    "https://192.168.1.9",
    "https://169.254.169.254",
    "https://[::1]",
    "https://localhost",
    "https://honcho.local",
    "https://honcho.internal",
    "https://metadata.google.internal",
    "https://user:pass@memory.example.test",
  ])("rejects %s", async (baseUrl) => {
    const fetch = vi.fn();
    await expect(assertPublicHonchoBaseUrl(baseUrl, publicResolver)).rejects.toThrow(
      /public HTTPS|private/i,
    );
    const probe = await probePublicHoncho({
      baseUrl,
      apiKey: "honcho-admin-token",
      workspaceId: "rakazo-space-1",
      resolveHostname: publicResolver,
      fetch,
    });
    expect(probe).toEqual({ ok: false, error: PUBLIC_HONCHO_ERRORS.publicHttps });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a public name that resolves to a private address", async () => {
    const fetch = vi.fn();
    const probe = await probePublicHoncho({
      baseUrl: "https://memory.example.test",
      apiKey: "honcho-admin-token",
      workspaceId: "rakazo-space-1",
      resolveHostname: privateResolver,
      fetch,
    });
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.error).toBe(PUBLIC_HONCHO_ERRORS.publicHttps);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(probe)).not.toContain("10.1.2.3");
  });

  it("checks a workspace get-or-create and does not follow a redirect", async () => {
    const seen: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const href = String(input);
      seen.push(href);
      if (href === "https://memory.example.test/v3/workspaces") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://10.0.0.8/v3/workspaces" },
        });
      }
      throw new Error(`unexpected ${href}`);
    });
    const probe = await probePublicHoncho({
      baseUrl: "https://memory.example.test",
      apiKey: "honcho-admin-token",
      workspaceId: "rakazo-space-1",
      resolveHostname: publicResolver,
      fetch,
    });
    expect(probe).toEqual({ ok: false, error: PUBLIC_HONCHO_ERRORS.publicHttps });
    expect(seen).toEqual(["https://memory.example.test/v3/workspaces"]);
    expect(JSON.stringify(probe)).not.toContain("honcho-admin-token");
  });

  it("accepts a public HTTPS host when the workspace get-or-create succeeds", async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://memory.example.test/v3/workspaces");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      expect(JSON.parse(String(init?.body))).toEqual({ id: "rakazo-space-1" });
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer honcho-admin-token");
      return new Response("", { status: 200 });
    });
    await expect(
      probePublicHoncho({
        baseUrl: "https://memory.example.test/",
        apiKey: "honcho-admin-token",
        workspaceId: "rakazo-space-1",
        resolveHostname: publicResolver,
        fetch,
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
  });

  it("does not follow a redirect to another public host", async () => {
    const fetch = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "https://other.example.test/v3/workspaces" },
      });
    });
    await expect(
      fetchPublicHoncho(
        { baseUrl: "https://memory.example.test", fetch, resolveHostname: publicResolver },
        "https://memory.example.test/v3/workspaces",
        { method: "POST", body: "{}" },
      ),
    ).rejects.toThrow(PUBLIC_HONCHO_ERRORS.redirect);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lets a chat continue when the owner Honcho is unreachable", async () => {
    const provider = new HonchoMemoryProvider(
      {
        baseUrl: "https://memory.example.test",
        apiKey: "honcho-admin-token",
        reasoningLevel: "low",
        egress: "public",
        fetch: async () => {
          throw new Error("offline");
        },
        resolveHostname: publicResolver,
      },
      { mode: "public", baseUrl: "https://memory.example.test", source: "owner-honcho" },
    );
    await expect(
      provider.recall({ query: "invoices", scope: "isolated", botId: "bot-1", limit: 5 }, context),
    ).resolves.toMatchObject({ ok: false });
  });
});
