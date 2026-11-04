import { parseMcpOAuthAuthorizationParams } from "@rakazo/contracts";

/** One deployment-wide OAuth client, matched by the MCP server's endpoint host. */
export type McpOAuthPreset = {
  /** Hostname, or a pattern with one leading wildcard label (`*.googleapis.com`). */
  pattern: string;
  clientId: string;
  clientSecret?: string;
  extraAuthorizationParams: Record<string, string>;
};

const HOST_PATTERN =
  /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Google issues a refresh token only when the authorization request asks this way. */
const GOOGLE_REFRESH_PARAMS = { access_type: "offline", prompt: "consent" };

/**
 * Parse `MCP_OAUTH_PRESET_CLIENTS`. Unset or blank is no presets. A bad value throws
 * an error that names the variable and the host pattern, never the secret or the raw JSON.
 */
export function parseMcpOAuthPresetClients(raw: string | undefined): McpOAuthPreset[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MCP_OAUTH_PRESET_CLIENTS must be a JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP_OAUTH_PRESET_CLIENTS must be a JSON object");
  }
  const presets: McpOAuthPreset[] = [];
  for (const [pattern, value] of Object.entries(parsed)) {
    if (!HOST_PATTERN.test(pattern)) {
      throw new Error(`MCP_OAUTH_PRESET_CLIENTS has an invalid host pattern: ${pattern}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`MCP_OAUTH_PRESET_CLIENTS entry for ${pattern} must be an object`);
    }
    const record = value as Record<string, unknown>;
    if (typeof record.clientId !== "string" || !record.clientId.trim()) {
      throw new Error(`MCP_OAUTH_PRESET_CLIENTS entry for ${pattern} needs a clientId`);
    }
    if (record.clientSecret !== undefined && typeof record.clientSecret !== "string") {
      throw new Error(`MCP_OAUTH_PRESET_CLIENTS entry for ${pattern} has an invalid clientSecret`);
    }
    const clientSecret = typeof record.clientSecret === "string" ? record.clientSecret : undefined;
    presets.push({
      pattern: pattern.toLowerCase(),
      clientId: record.clientId.trim(),
      ...(clientSecret ? { clientSecret } : {}),
      extraAuthorizationParams: extraAuthorizationParams(record.extraAuthorizationParams, pattern),
    });
  }
  return presets;
}

/** The preset for this MCP endpoint, if any. An exact host wins over a wildcard. */
export function matchMcpOAuthPreset(
  presets: readonly McpOAuthPreset[],
  endpoint: string | null | undefined,
): McpOAuthPreset | undefined {
  const host = endpointHost(endpoint);
  if (!host) return undefined;
  let best: McpOAuthPreset | undefined;
  let bestScore = -1;
  for (const preset of presets) {
    if (!hostMatches(preset.pattern, host)) continue;
    const score = preset.pattern.startsWith("*.")
      ? preset.pattern.length
      : 10_000 + preset.pattern.length;
    if (score > bestScore) {
      best = preset;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The client the broker should send. Google hosts gain `access_type=offline` and
 * `prompt=consent` unless the preset already set them. The result is a new object.
 */
export function presetOAuthClient(
  preset: McpOAuthPreset,
  endpoint: string,
): { client_id: string; client_secret?: string; authorization_params?: string } {
  const params = { ...preset.extraAuthorizationParams };
  const host = endpointHost(endpoint);
  if (host && isGoogleHost(host)) {
    for (const [key, value] of Object.entries(GOOGLE_REFRESH_PARAMS)) {
      if (!params[key]) params[key] = value;
    }
  }
  const authorization_params = new URLSearchParams(params).toString();
  return {
    client_id: preset.clientId,
    ...(preset.clientSecret ? { client_secret: preset.clientSecret } : {}),
    ...(authorization_params ? { authorization_params } : {}),
  };
}

function extraAuthorizationParams(value: unknown, pattern: string): Record<string, string> {
  if (value === undefined) return {};
  let raw: string;
  if (typeof value === "string") {
    raw = value;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries: [string, string][] = [];
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== "string") {
        throw new Error(
          `MCP_OAUTH_PRESET_CLIENTS entry for ${pattern} has an invalid extraAuthorizationParams value`,
        );
      }
      if (entry !== "") entries.push([key, entry]);
    }
    raw = new URLSearchParams(entries).toString();
  } else {
    throw new Error(
      `MCP_OAUTH_PRESET_CLIENTS entry for ${pattern} has an invalid extraAuthorizationParams`,
    );
  }
  try {
    return parseMcpOAuthAuthorizationParams(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid extraAuthorizationParams";
    throw new Error(`MCP_OAUTH_PRESET_CLIENTS entry for ${pattern}: ${reason}`);
  }
}

function endpointHost(endpoint: string | null | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    return new URL(endpoint).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function hostMatches(pattern: string, host: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return pattern === host;
}

function isGoogleHost(host: string): boolean {
  return host === "googleapis.com" || host.endsWith(".googleapis.com");
}
