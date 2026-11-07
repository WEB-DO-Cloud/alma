import {
  MCP_DYNAMIC_REGISTRATION_UNSUPPORTED,
  McpOAuthBroker,
  parseMcpOAuthPresetClients,
} from "@rakazo/adapters";
import { describe, expect, it } from "vitest";
import { mcpServerDto } from "./mcp-servers.js";

const PRESET_SECRET = "preset-client-secret";

const presets = parseMcpOAuthPresetClients(
  JSON.stringify({
    "*.googleapis.com": {
      clientId: "preset-client",
      clientSecret: PRESET_SECRET,
      extraAuthorizationParams: { access_type: "offline", prompt: "consent" },
    },
  }),
);

const row = {
  id: "server-1",
  spaceId: "space-1",
  slug: "gmail",
  name: "Gmail",
  description: "",
  transport: "streamable_http",
  endpoint: "https://gmailmcp.googleapis.com/mcp/v1",
  command: null,
  args: [],
  hasArgs: false,
  env: {},
  files: {},
  headers: {},
  secretId: null,
  enabled: true,
  verbatimResults: false,
  revision: 1,
  healthStatus: "error",
  healthMessage: MCP_DYNAMIC_REGISTRATION_UNSUPPORTED,
  healthToolCount: null,
  healthCheckedAt: new Date("2026-01-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("preset OAuth clients in API responses", () => {
  it("tells the client a preset can sign in and does not include the secret", async () => {
    const broker = new McpOAuthBroker({} as never, {} as never, {}, false, presets);
    const summary = await broker.summaryFor(
      { id: row.id, endpoint: row.endpoint, secretId: null },
      { spaceId: row.spaceId, userId: "user-1" },
    );
    const dto = mcpServerDto(row, summary);

    expect(summary).toEqual({ status: "none", clientId: null, preset: true, credential: false });
    expect(dto.oauthPreset).toBe(true);
    expect(dto.oauthClientId).toBeNull();
    expect(dto.health).toMatchObject({ status: "unknown", code: null });
    expect(JSON.stringify(dto)).not.toContain(PRESET_SECRET);
    expect(JSON.stringify(dto)).not.toContain("preset-client");
  });

  it("keeps a user's client ahead of the preset and still hides the preset secret", async () => {
    const userSecret = "user-client-secret";
    const broker = new McpOAuthBroker(
      {} as never,
      {
        load: async () =>
          JSON.stringify({ oauthClient: { client_id: "user-client", client_secret: userSecret } }),
      } as never,
      {},
      false,
      presets,
    );
    const summary = await broker.summaryForCiphertext(
      "cipher",
      "record-1",
      "https://gmailmcp.googleapis.com/mcp/v1",
    );
    const dto = mcpServerDto({ ...row, secretId: "record-1" }, summary);

    expect(summary).toEqual({ status: "none", clientId: "user-client", credential: true });
    expect(dto.oauthPreset).toBe(false);
    expect(dto.oauthClientId).toBe("user-client");
    const encoded = JSON.stringify(dto);
    expect(encoded).not.toContain(PRESET_SECRET);
    expect(encoded).not.toContain(userSecret);
  });
});
