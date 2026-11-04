import { describe, expect, it } from "vitest";
import {
  matchMcpOAuthPreset,
  parseMcpOAuthPresetClients,
  presetOAuthClient,
} from "./mcp-oauth-presets.js";

const SECRET = "preset-client-secret";

const google = {
  "*.googleapis.com": {
    clientId: "google-client",
    clientSecret: SECRET,
    extraAuthorizationParams: { access_type: "offline", prompt: "consent" },
  },
};

describe("parseMcpOAuthPresetClients", () => {
  it("is empty when the variable is unset", () => {
    expect(parseMcpOAuthPresetClients(undefined)).toEqual([]);
    expect(parseMcpOAuthPresetClients("  ")).toEqual([]);
  });

  it("reads a host pattern and keeps the secret off the error text", () => {
    expect(parseMcpOAuthPresetClients(JSON.stringify(google))).toEqual([
      {
        pattern: "*.googleapis.com",
        clientId: "google-client",
        clientSecret: SECRET,
        extraAuthorizationParams: { access_type: "offline", prompt: "consent" },
      },
    ]);

    const raw = JSON.stringify({ "*.googleapis.com": { clientSecret: SECRET } });
    expect(() => parseMcpOAuthPresetClients("{")).toThrow(
      "MCP_OAUTH_PRESET_CLIENTS must be a JSON object",
    );
    expect(() => parseMcpOAuthPresetClients(raw)).toThrow(/needs a clientId/);
    expect(() => parseMcpOAuthPresetClients(raw)).not.toThrow(SECRET);
    expect(() =>
      parseMcpOAuthPresetClients(`{"bad host":{"clientId":"x","clientSecret":"${SECRET}"}}`),
    ).not.toThrow(SECRET);
  });

  it("accepts the query-string form of the extra parameters", () => {
    const parsed = parseMcpOAuthPresetClients(
      JSON.stringify({
        "gmailmcp.googleapis.com": {
          clientId: "google-client",
          extraAuthorizationParams: "access_type=offline&prompt=consent",
        },
      }),
    );
    expect(parsed[0]?.extraAuthorizationParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
    expect(parsed[0]?.clientSecret).toBeUndefined();
  });
});

describe("matchMcpOAuthPreset", () => {
  const presets = parseMcpOAuthPresetClients(
    JSON.stringify({
      ...google,
      "gmailmcp.googleapis.com": { clientId: "gmail-client", clientSecret: "gmail-secret" },
      "calendar.example.test": { clientId: "other-client" },
    }),
  );

  it("matches a wildcard host and lets an exact host win", () => {
    expect(matchMcpOAuthPreset(presets, "https://drivemcp.googleapis.com/mcp/v1")?.clientId).toBe(
      "google-client",
    );
    expect(matchMcpOAuthPreset(presets, "https://gmailmcp.googleapis.com/mcp/v1")?.clientId).toBe(
      "gmail-client",
    );
    expect(matchMcpOAuthPreset(presets, "https://calendar.example.test/mcp")?.clientId).toBe(
      "other-client",
    );
  });

  it("does not match a lookalike host or an endpoint with no preset", () => {
    expect(matchMcpOAuthPreset(presets, "https://googleapis.com/mcp")).toBeUndefined();
    expect(matchMcpOAuthPreset(presets, "https://notgoogleapis.com/mcp")).toBeUndefined();
    expect(
      matchMcpOAuthPreset(presets, "https://evil.googleapis.com.attacker.test/mcp"),
    ).toBeUndefined();
    expect(matchMcpOAuthPreset(presets, "https://mcp.example.test/mcp")).toBeUndefined();
    expect(matchMcpOAuthPreset(presets, null)).toBeUndefined();
    expect(matchMcpOAuthPreset([], "https://gmailmcp.googleapis.com/mcp/v1")).toBeUndefined();
  });
});

describe("presetOAuthClient", () => {
  it("adds Google's refresh-token parameters when the preset omitted them", () => {
    const [preset] = parseMcpOAuthPresetClients(
      JSON.stringify({ "*.googleapis.com": { clientId: "google-client", clientSecret: SECRET } }),
    );
    expect(preset).toBeDefined();
    expect(presetOAuthClient(preset!, "https://calendarmcp.googleapis.com/mcp/v1")).toEqual({
      client_id: "google-client",
      client_secret: SECRET,
      authorization_params: "access_type=offline&prompt=consent",
    });
  });

  it("keeps a preset's own Google parameters", () => {
    const [preset] = parseMcpOAuthPresetClients(JSON.stringify(google));
    const client = presetOAuthClient(preset!, "https://gmailmcp.googleapis.com/mcp/v1");
    expect(client.authorization_params).toBe("access_type=offline&prompt=consent");
  });
});
