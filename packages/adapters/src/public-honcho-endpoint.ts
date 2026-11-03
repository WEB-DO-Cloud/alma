import {
  isCloudMetadataHost,
  isLoopbackHost,
  isPrivateNetworkHost,
  normalizeHost,
} from "@rakazo/contracts";
import { parseServiceBaseUrl } from "./local-service-endpoint.js";
import type { ResolveHostname } from "./network-address.js";
import { egressRefused } from "./network-address.js";
import { assertSafeWebUrl, fetchSafeHttpRequest, isBlockedHostname } from "./web-ssrf.js";

/** Saved on a Space that opted out of the server Honcho. */
export const OWNER_HONCHO_SOURCE = "owner-honcho";

/** Public HTTPS Honcho. Distinct from local mode, which is a private network. */
export const PUBLIC_HONCHO_MODE = "public";

/**
 * Owner servers sit on the chat path. A dead Mac Mini must fail this fast so the
 * turn continues on MEMORY.md instead of waiting out the server-env timeout.
 */
export const PUBLIC_HONCHO_TIMEOUT_MS = 5_000;

export const PUBLIC_HONCHO_ERRORS = {
  publicHttps:
    "Use a public HTTPS address. Private, loopback, and link-local addresses are not allowed.",
  redirect: "Honcho redirects are not followed.",
  unreachable: "Honcho is unreachable or the request timed out.",
  rejectedKey: "Honcho refused the API key.",
  missingKey: "Enter the API key.",
} as const;

export type PublicHonchoErrorCode =
  | "public-https"
  | "redirect"
  | "unreachable"
  | "rejected-key"
  | "missing-key";

export function isOwnerHonchoSettings(settings: Record<string, string>): boolean {
  return settings.source === OWNER_HONCHO_SOURCE && settings.mode === PUBLIC_HONCHO_MODE;
}

/** Map a transport failure to a stable sentence. Resolved addresses are not included. */
export function publicHonchoTransportError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/private|internal|loopback|link-local|public https/i.test(message)) {
    return PUBLIC_HONCHO_ERRORS.publicHttps;
  }
  if (/redirect/i.test(message)) return PUBLIC_HONCHO_ERRORS.redirect;
  return PUBLIC_HONCHO_ERRORS.unreachable;
}

export function publicHonchoErrorCode(error: string): PublicHonchoErrorCode {
  if (error === PUBLIC_HONCHO_ERRORS.publicHttps) return "public-https";
  if (error === PUBLIC_HONCHO_ERRORS.redirect) return "redirect";
  if (error === PUBLIC_HONCHO_ERRORS.rejectedKey || /failed: 40[13]\b/.test(error)) {
    return "rejected-key";
  }
  if (error === PUBLIC_HONCHO_ERRORS.missingKey || /apiKey/i.test(error)) return "missing-key";
  return "unreachable";
}

function hostnameOf(url: URL): string {
  return normalizeHost(url.hostname);
}

function refusesPublicHonchoHost(host: string): boolean {
  return (
    isBlockedHostname(host) ||
    isLoopbackHost(host) ||
    isPrivateNetworkHost(host) ||
    isCloudMetadataHost(host)
  );
}

/**
 * Owner-supplied Honcho: https only, no credentials, query, or fragment, and a host that is
 * not loopback, link-local, private, or an internal name. DNS is checked separately.
 */
export function assertPublicHonchoBaseUrlSync(baseUrl: string): URL {
  let url: URL;
  try {
    url = parseServiceBaseUrl(baseUrl);
  } catch {
    throw new Error(PUBLIC_HONCHO_ERRORS.publicHttps);
  }
  if (url.protocol !== "https:") throw new Error(PUBLIC_HONCHO_ERRORS.publicHttps);
  const host = hostnameOf(url);
  if (!host || refusesPublicHonchoHost(host)) {
    throw egressRefused(host || baseUrl, new Error(PUBLIC_HONCHO_ERRORS.publicHttps));
  }
  return url;
}

/** Sync checks plus DNS. Every answer must be a public address. Redirects are not resolved here. */
export async function assertPublicHonchoBaseUrl(
  baseUrl: string,
  resolveHostname?: ResolveHostname,
): Promise<URL> {
  const url = assertPublicHonchoBaseUrlSync(baseUrl);
  try {
    await assertSafeWebUrl(url.href, resolveHostname);
  } catch (error) {
    throw egressRefused(hostnameOf(url), error);
  }
  return url;
}

/** Origin plus path, without a trailing slash. `https://host` and `https://host/` match. */
export function normalizePublicHonchoBaseUrl(baseUrl: string): string {
  const url = assertPublicHonchoBaseUrlSync(baseUrl);
  const path = url.pathname.replace(/\/$/, "");
  return `${url.origin}${path}`;
}

export function samePublicHonchoBaseUrl(left: string, right: string): boolean {
  try {
    return normalizePublicHonchoBaseUrl(left) === normalizePublicHonchoBaseUrl(right);
  } catch {
    return false;
  }
}

function isUnderBase(base: URL, target: URL): boolean {
  if (target.origin !== base.origin || target.protocol !== "https:") return false;
  const prefix = base.pathname.replace(/\/$/, "");
  if (!prefix) return true;
  return target.pathname === prefix || target.pathname.startsWith(`${prefix}/`);
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

/**
 * One Honcho request to a public HTTPS host. DNS is checked again, including a redirect
 * target, and the redirect is never followed. The API key stays on the first host.
 */
export async function fetchPublicHoncho(
  config: {
    baseUrl: string;
    fetch?: typeof globalThis.fetch;
    resolveHostname?: ResolveHostname;
  },
  url: string,
  init: RequestInit,
  timeoutMs = PUBLIC_HONCHO_TIMEOUT_MS,
): Promise<Response> {
  const base = await assertPublicHonchoBaseUrl(config.baseUrl, config.resolveHostname);
  const target = new URL(url);
  if (!isUnderBase(base, target)) throw new Error(PUBLIC_HONCHO_ERRORS.publicHttps);
  const signal = init.signal ?? undefined;
  const response = await fetchSafeHttpRequest(
    target.href,
    {
      method: init.method ?? "GET",
      headers: headerRecord(init.headers),
      ...(typeof init.body === "string" ? { body: init.body } : {}),
    },
    {
      fetch: config.fetch,
      resolveHostname: config.resolveHostname,
      timeoutMs,
      signal,
    },
  );
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const next = new URL(location, target.href);
      await assertPublicHonchoBaseUrl(next.href, config.resolveHostname);
    }
    throw new Error(PUBLIC_HONCHO_ERRORS.redirect);
  }
  return new Response(Buffer.from(response.body), {
    status: response.status,
    headers: response.headers,
  });
}
