import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMcpRegistrySearchCache,
  mcpRegistrySearchUrl,
  searchMcpRegistry,
} from "./mcp-registry.js";

afterEach(() => {
  clearMcpRegistrySearchCache();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchMcpRegistry", () => {
  it("requests the pinned registry and caches the filtered page", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(url.href).toBe(mcpRegistrySearchUrl("notion").href);
      expect(init?.redirect).toBe("manual");
      return jsonResponse({
        servers: [
          {
            server: {
              name: "com.notion/mcp",
              title: "Notion",
              description: "Official Notion MCP server",
              remotes: [
                { type: "stdio", url: "https://mcp.notion.com/stdio" },
                { type: "streamable-http", url: "https://mcp.notion.com/mcp" },
              ],
            },
          },
          {
            server: {
              name: "local.pack/only",
              packages: [
                { registryType: "npm", identifier: "example", transport: { type: "stdio" } },
              ],
            },
          },
        ],
      });
    });

    const first = await searchMcpRegistry({ query: " Notion ", limit: 12, fetch, now: 1_000 });
    const second = await searchMcpRegistry({ query: "notion", limit: 1, fetch, now: 2_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual([
      {
        registryName: "com.notion/mcp",
        name: "Notion",
        description: "Official Notion MCP server",
        iconUrl: null,
        transport: "streamable_http",
        endpoint: "https://mcp.notion.com/mcp",
        needsHeader: false,
        headerName: null,
      },
    ]);
    expect(second).toEqual(first.slice(0, 1));

    await searchMcpRegistry({ query: "notion", limit: 12, fetch, now: 1_000 + 60_000 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses redirects and does not cache a failure", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://evil.example/mcp" } }),
    );
    await expect(
      searchMcpRegistry({ query: "notion", limit: 12, fetch, now: 1_000 }),
    ).rejects.toThrow("MCP registry redirects are not allowed");
    fetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
    await expect(
      searchMcpRegistry({ query: "notion", limit: 12, fetch, now: 1_000 }),
    ).resolves.toEqual([]);
  });
});
