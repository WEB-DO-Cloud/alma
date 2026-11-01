import { isPrivateRemoteMcpHostname } from "@rakazo/adapters";
import type { McpRegistryServer } from "@rakazo/contracts";
import { isLocalMcpHost } from "@rakazo/contracts";
import { MCP_REGISTRY_UPSTREAM_LIMIT, normalizeMcpRegistryList } from "@rakazo/core";

const REGISTRY_ORIGIN = "https://registry.modelcontextprotocol.io";
const CACHE_TTL_MS = 60_000;
const RESPONSE_LIMIT = 1_000_000;

type CacheEntry = { expiresAt: number; servers: McpRegistryServer[] };

const cache = new Map<string, CacheEntry>();

export function clearMcpRegistrySearchCache(): void {
  cache.clear();
}

function blockedHost(hostname: string): boolean {
  return isLocalMcpHost(hostname) || isPrivateRemoteMcpHostname(hostname);
}

export function mcpRegistrySearchUrl(query: string): URL {
  const url = new URL("/v0/servers", REGISTRY_ORIGIN);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(MCP_REGISTRY_UPSTREAM_LIMIT));
  url.searchParams.set("version", "latest");
  return url;
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT) {
    throw new Error("MCP registry response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error("MCP registry response is too large");
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function searchMcpRegistry(input: {
  query: string;
  limit: number;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
  now?: number;
}): Promise<McpRegistryServer[]> {
  const query = input.query.trim().toLowerCase();
  const now = input.now ?? Date.now();
  const cached = cache.get(query);
  const servers =
    cached && cached.expiresAt > now
      ? cached.servers
      : await loadMcpRegistry(query, input.signal, input.fetch ?? globalThis.fetch, now);
  return servers.slice(0, input.limit);
}

async function loadMcpRegistry(
  query: string,
  signal: AbortSignal | undefined,
  fetch: typeof globalThis.fetch,
  now: number,
): Promise<McpRegistryServer[]> {
  const response = await fetch(mcpRegistrySearchUrl(query), {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5_000)])
      : AbortSignal.timeout(5_000),
  });
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error("MCP registry redirects are not allowed");
  }
  if (!response.ok) throw new Error(`MCP registry returned HTTP ${response.status}`);
  let payload: unknown;
  try {
    payload = JSON.parse(await readBounded(response));
  } catch (error) {
    if (error instanceof Error && error.message === "MCP registry response is too large")
      throw error;
    throw new Error("MCP registry returned an invalid response");
  }
  const servers = normalizeMcpRegistryList(payload, blockedHost);
  cache.delete(query);
  cache.set(query, { expiresAt: now + CACHE_TTL_MS, servers });
  while (cache.size > 50) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return servers;
}
