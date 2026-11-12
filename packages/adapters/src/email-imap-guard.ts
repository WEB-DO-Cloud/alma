import { lookup } from "node:dns/promises";
import { ipVersion, isNonPublicAddress, isUnsafeMailHost, normalizeHost } from "@rakazo/contracts";
import type { ResolveHostname } from "./network-address.js";

export class MailHostRejected extends Error {
  readonly code: "private_host" | "invalid";

  constructor(code: "private_host" | "invalid") {
    super(code);
    this.name = "MailHostRejected";
    this.code = code;
  }
}

const defaultResolve: ResolveHostname = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

/**
 * Resolves a mail host and refuses private, loopback, link-local, and metadata targets.
 * The returned `host` is one address that was checked, so a later DNS change cannot redirect it.
 */
export async function resolvePublicMailHost(
  host: string,
  resolve: ResolveHostname = defaultResolve,
): Promise<{ host: string; servername: string; addresses: string[] }> {
  if (isUnsafeMailHost(host)) throw new MailHostRejected(unsafeCode(host));
  const servername = normalizeHost(host);
  if (ipVersion(servername) !== 0) {
    return { host: servername, servername, addresses: [servername] };
  }
  let resolved: { address: string }[];
  try {
    resolved = await resolve(servername);
  } catch (error) {
    if (error instanceof MailHostRejected) throw error;
    throw error;
  }
  const addresses = resolved.map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some((address) => isNonPublicAddress(address))) {
    throw new MailHostRejected("private_host");
  }
  const pinned = addresses[0];
  if (!pinned) throw new MailHostRejected("private_host");
  return { host: pinned, servername, addresses };
}

function unsafeCode(host: string): "private_host" | "invalid" {
  const normalized = normalizeHost(host.trim());
  if (!normalized || normalized.length > 253) return "invalid";
  if (ipVersion(normalized) !== 0) return "private_host";
  if (isUnsafeMailHost(normalized) && (normalized.includes(".") || normalized === "localhost")) {
    return normalized.includes(" ") ? "invalid" : "private_host";
  }
  return "invalid";
}
