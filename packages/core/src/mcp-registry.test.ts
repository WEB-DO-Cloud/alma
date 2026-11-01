import { McpRegistryServerSchema } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  availableMcpSlug,
  MCP_REGISTRY_RESULT_CAP,
  normalizeMcpRegistryList,
  remoteMcpCreateInput,
} from "./mcp-registry.js";
import { FEATURED_MCP_SERVERS } from "./mcp-registry-featured.js";

const blocked = (hostname: string) =>
  hostname === "10.0.0.8" || hostname === "169.254.169.254" || hostname.endsWith(".internal");

function entry(server: Record<string, unknown>, status = "active") {
  return {
    server,
    _meta: { "io.modelcontextprotocol.registry/official": { status } },
  };
}

describe("featured MCP servers", () => {
  it("lists distinct https remotes the registry published", () => {
    expect(FEATURED_MCP_SERVERS.length).toBeGreaterThan(0);
    const endpoints = FEATURED_MCP_SERVERS.map((server) => server.endpoint);
    expect(new Set(endpoints).size).toBe(endpoints.length);
    for (const server of FEATURED_MCP_SERVERS) {
      expect(McpRegistryServerSchema.parse(server)).toEqual(server);
      expect(server.endpoint.startsWith("https://")).toBe(true);
      expect(server.transport).toBe("streamable_http");
      expect(server.needsHeader).toBe(false);
    }
  });
});

describe("normalizeMcpRegistryList", () => {
  it("prefers streamable HTTP, hides stdio, and drops private or template URLs", () => {
    const servers = normalizeMcpRegistryList(
      {
        servers: [
          entry({
            name: "com.notion/mcp",
            title: "Notion",
            description: "Official   Notion MCP server",
            remotes: [
              { type: "sse", url: "https://mcp.notion.com/sse" },
              { type: "streamable-http", url: "https://mcp.notion.com/mcp" },
            ],
          }),
          entry({
            name: "local.only/stdio",
            description: "Package",
            packages: [{ registryType: "npm", transport: { type: "stdio" } }],
          }),
          entry({
            name: "bad.template/server",
            remotes: [{ type: "streamable-http", url: "https://example.test/mcp/{token}" }],
          }),
          entry({
            name: "bad.private/server",
            remotes: [{ type: "streamable-http", url: "https://10.0.0.8/mcp" }],
          }),
          entry({
            name: "bad.metadata/server",
            remotes: [{ type: "streamable-http", url: "https://169.254.169.254/latest" }],
          }),
          entry(
            {
              name: "com.example/retired",
              remotes: [{ type: "sse", url: "https://retired.example.test/mcp" }],
            },
            "deleted",
          ),
          entry({
            name: "com.example/keyed",
            description: "Needs a token",
            remotes: [
              {
                type: "streamable-http",
                url: "https://keyed.example.test/mcp",
                headers: [
                  {
                    name: "Authorization",
                    isRequired: true,
                    isSecret: true,
                    value: "Bearer {token}",
                  },
                ],
              },
            ],
            icons: [
              { src: "https://cdn.example.test/icon.svg" },
              { src: "http://insecure.test/x" },
            ],
          }),
        ],
      },
      blocked,
    );

    expect(servers.map((server) => server.registryName)).toEqual([
      "com.notion/mcp",
      "com.example/keyed",
    ]);
    expect(servers[0]).toMatchObject({
      name: "Notion",
      description: "Official Notion MCP server",
      transport: "streamable_http",
      endpoint: "https://mcp.notion.com/mcp",
      needsHeader: false,
      iconUrl: null,
    });
    expect(servers[1]).toMatchObject({
      transport: "streamable_http",
      endpoint: "https://keyed.example.test/mcp",
      needsHeader: true,
      headerName: "Authorization",
      iconUrl: "https://cdn.example.test/icon.svg",
    });
    expect(JSON.stringify(servers)).not.toContain("{token}");
  });

  it("stops at the result cap", () => {
    const servers = normalizeMcpRegistryList({
      servers: Array.from({ length: MCP_REGISTRY_RESULT_CAP + 5 }, (_, index) =>
        entry({
          name: `com.example/server-${index}`,
          title: `Server ${index}`,
          remotes: [{ type: "sse", url: `https://server-${index}.example.test/mcp` }],
        }),
      ),
    });
    expect(servers).toHaveLength(MCP_REGISTRY_RESULT_CAP);
    expect(servers[0]?.transport).toBe("sse");
  });
});

describe("remote MCP create input", () => {
  it("picks a free slug and attaches a required header", () => {
    expect(availableMcpSlug("GitHub", ["github"])).toBe("github-2");
    expect(availableMcpSlug("Notion", [])).toBe("notion");
    expect(
      remoteMcpCreateInput(
        {
          name: "Keyed",
          description: "Needs a token",
          endpoint: "https://keyed.example.test/mcp",
          transport: "streamable_http",
          headerName: "Authorization",
        },
        "keyed",
        "secret-value",
      ),
    ).toMatchObject({
      slug: "keyed",
      transport: "streamable_http",
      endpoint: "https://keyed.example.test/mcp",
      headers: { Authorization: "secret-value" },
    });
  });
});
