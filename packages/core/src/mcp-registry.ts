import type { McpRegistryServer, McpServerConfigInput } from "@rakazo/contracts";
import { isLocalMcpHost } from "@rakazo/contracts";
import { deriveMcpSlug } from "./mcp.js";

const TRANSPORTS = {
  "streamable-http": "streamable_http",
  sse: "sse",
} as const;

/** How many addable remotes a search keeps. The registry page is larger so stdio rows can be dropped. */
export const MCP_REGISTRY_RESULT_CAP = 20;

/** Upstream page size. Larger than the cap so stdio-only rows do not empty the page. */
export const MCP_REGISTRY_UPSTREAM_LIMIT = 30;

export function availableMcpSlug(name: string, taken: readonly string[]): string {
  const takenSet = new Set(taken);
  const derived = deriveMcpSlug(name).replace(/[^a-z0-9_-]/g, "");
  const root = /^[a-z0-9]/.test(derived) ? derived.slice(0, 64) : "mcp";
  if (!takenSet.has(root)) return root;
  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${root.slice(0, 64 - suffix.length)}${suffix}`;
    if (!takenSet.has(candidate)) return candidate;
  }
  return `mcp-${taken.length}`.slice(0, 64);
}

export function remoteMcpCreateInput(
  server: Pick<McpRegistryServer, "name" | "description" | "endpoint" | "transport" | "headerName">,
  slug: string,
  headerValue?: string,
): McpServerConfigInput {
  const headerName = server.headerName;
  const headers =
    headerName && headerValue ? { [headerName]: headerValue } : ({} as Record<string, string>);
  return {
    slug,
    name: server.name,
    description: server.description,
    enabled: true,
    transport: server.transport,
    endpoint: server.endpoint,
    headers,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shortText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function httpsUrl(value: unknown, isBlockedHost: (hostname: string) => boolean): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || trimmed.includes("{") || trimmed.endsWith("#"))
    return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalMcpHost(hostname) || isBlockedHost(hostname)) return null;
  return trimmed;
}

function displayName(server: Record<string, unknown>): string {
  const title = shortText(server.title, 120);
  if (title) return title;
  const raw = shortText(server.name, 300);
  const leaf = raw.split("/").pop() ?? raw;
  const words = leaf.replace(/[-_]+/g, " ").trim();
  return (words || "MCP server").slice(0, 120);
}

function headerRequirement(remote: Record<string, unknown>): {
  needsHeader: boolean;
  headerName: string | null;
} {
  if (!Array.isArray(remote.headers)) return { needsHeader: false, headerName: null };
  for (const header of remote.headers) {
    if (!isRecord(header) || header.isRequired !== true) continue;
    const name = shortText(header.name, 64);
    if (!/^[A-Za-z0-9-]+$/.test(name)) return { needsHeader: true, headerName: null };
    return { needsHeader: true, headerName: name };
  }
  return { needsHeader: false, headerName: null };
}

function iconUrl(
  server: Record<string, unknown>,
  isBlockedHost: (hostname: string) => boolean,
): string | null {
  if (!Array.isArray(server.icons)) return null;
  for (const icon of server.icons) {
    if (!isRecord(icon)) continue;
    const src = httpsUrl(icon.src, isBlockedHost);
    if (src) return src;
  }
  return null;
}

function remoteChoice(
  server: Record<string, unknown>,
  isBlockedHost: (hostname: string) => boolean,
): {
  transport: "streamable_http" | "sse";
  endpoint: string;
  remote: Record<string, unknown>;
} | null {
  if (!Array.isArray(server.remotes)) return null;
  const ranked = server.remotes.filter(isRecord).sort((left, right) => {
    const leftRank = left.type === "streamable-http" ? 0 : 1;
    const rightRank = right.type === "streamable-http" ? 0 : 1;
    return leftRank - rightRank;
  });
  for (const remote of ranked) {
    const transport = TRANSPORTS[remote.type as keyof typeof TRANSPORTS];
    if (!transport) continue;
    const endpoint = httpsUrl(remote.url, isBlockedHost);
    if (!endpoint) continue;
    return { transport, endpoint, remote };
  }
  return null;
}

function isActive(entry: Record<string, unknown>): boolean {
  const meta = entry._meta;
  if (!isRecord(meta)) return true;
  const official = meta["io.modelcontextprotocol.registry/official"];
  if (!isRecord(official)) return true;
  const status = official.status;
  return status === undefined || status === "active";
}

/**
 * Keep remote registry rows the product can add. Stdio packages, template URLs,
 * and private hosts are dropped. `isBlockedHost` adds deployment private-network rules.
 */
export function normalizeMcpRegistryList(
  payload: unknown,
  isBlockedHost: (hostname: string) => boolean = () => false,
): McpRegistryServer[] {
  if (!isRecord(payload) || !Array.isArray(payload.servers)) return [];
  const servers: McpRegistryServer[] = [];
  for (const entry of payload.servers) {
    if (!isRecord(entry) || !isActive(entry)) continue;
    const server = entry.server;
    if (!isRecord(server)) continue;
    const registryName = shortText(server.name, 300);
    if (!registryName) continue;
    const chosen = remoteChoice(server, isBlockedHost);
    if (!chosen) continue;
    const header = headerRequirement(chosen.remote);
    if (header.needsHeader && !header.headerName) continue;
    servers.push({
      registryName,
      name: displayName(server),
      description: shortText(server.description, 280),
      iconUrl: iconUrl(server, isBlockedHost),
      transport: chosen.transport,
      endpoint: chosen.endpoint,
      needsHeader: header.needsHeader,
      headerName: header.headerName,
    });
    if (servers.length >= MCP_REGISTRY_RESULT_CAP) break;
  }
  return servers;
}
