export type ToolkitDirectoryEntry = {
  slug: string;
  name: string;
  logo: string | null;
  noAuth: boolean;
  /** Category name from the toolkit index, when it sent one. */
  category?: string;
  /** No shared sign-in and no project setup for this app, so connecting it can only fail. */
  needsSignInSetup?: boolean;
};

export type ToolkitCatalogEntry = Omit<ToolkitDirectoryEntry, "needsSignInSetup"> & {
  connected: boolean;
};

export const COMPOSIO_DIRECTORY_TTL_MS = 60 * 60 * 1000;

export type ManagedAuthToolkit = {
  slug: string;
  noAuth?: boolean;
  /**
   * Schemes Composio can sign the user in with. Missing means the directory did not say.
   * An empty array means this app has no managed sign-in.
   */
  composioManagedAuthSchemes?: string[] | null;
};

/**
 * Apps that stay hidden until this project has its own auth config.
 * A project with no auth configs, whose index says that about every app, is not
 * evidence: that is how a new project describes Gmail too. Composio still opens
 * its connect link and creates the managed config then.
 */
export function signInSetupSlugs(
  toolkits: readonly ManagedAuthToolkit[],
  configuredSlugs: Iterable<string>,
): { needsSetup: Set<string>; trusted: boolean } {
  const key = (slug: string) => slug.trim().toLowerCase();
  const configured = new Set([...configuredSlugs].map(key).filter(Boolean));
  const candidates = toolkits.filter((toolkit) => !toolkit.noAuth && key(toolkit.slug));
  const known = candidates.filter((toolkit) => Array.isArray(toolkit.composioManagedAuthSchemes));
  const trusted = !(
    configured.size === 0 &&
    known.length > 0 &&
    known.length === candidates.length &&
    known.every((toolkit) => toolkit.composioManagedAuthSchemes?.length === 0)
  );
  if (!trusted) return { needsSetup: new Set(), trusted };
  return {
    trusted,
    needsSetup: new Set(
      known
        .filter((toolkit) => toolkit.composioManagedAuthSchemes?.length === 0)
        .map((toolkit) => key(toolkit.slug))
        .filter((slug) => !configured.has(slug)),
    ),
  };
}

export function mergeCatalogWithConnected(
  directory: ToolkitDirectoryEntry[],
  connectedSlugs: Iterable<string>,
  /** Slugs with any account, active or not; these stay listed even when sign-in needs setup. */
  accountSlugs: Iterable<string> = [],
): ToolkitCatalogEntry[] {
  const key = (slug: string) => slug.trim().toLowerCase();
  const connected = new Set([...connectedSlugs].map(key));
  const withAccount = new Set([...accountSlugs].map(key));
  return directory.flatMap(({ needsSignInSetup, ...item }) => {
    const isConnected = connected.has(key(item.slug));
    if (needsSignInSetup && !isConnected && !withAccount.has(key(item.slug))) return [];
    return [{ ...item, connected: isConnected }];
  });
}

/**
 * Coalesces directory loads and serves stale entries during refreshes. Failed
 * refreshes preserve stale entries for later retries; cold-load errors propagate.
 */
export function createToolkitDirectoryCache(opts?: { ttlMs?: number; now?: () => number }) {
  const ttlMs = opts?.ttlMs ?? COMPOSIO_DIRECTORY_TTL_MS;
  const now = opts?.now ?? Date.now;
  let entry: { items: ToolkitDirectoryEntry[]; fetchedAt: number } | undefined;
  let inflight: Promise<ToolkitDirectoryEntry[]> | undefined;

  async function load(loader: () => Promise<ToolkitDirectoryEntry[]>) {
    inflight ??= loader()
      .then((items) => {
        entry = { items, fetchedAt: now() };
        return items;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  }

  return {
    peek(): ToolkitDirectoryEntry[] | undefined {
      return entry?.items;
    },
    async get(loader: () => Promise<ToolkitDirectoryEntry[]>): Promise<ToolkitDirectoryEntry[]> {
      if (!entry) return load(loader);
      if (now() - entry.fetchedAt < ttlMs) return entry.items;
      if (!inflight) {
        // Keep stale items on failure; load clears inflight so a later read can retry.
        void load(loader).catch(() => undefined);
      }
      return entry.items;
    },
    invalidate() {
      entry = undefined;
    },
  };
}

export const composioToolkitDirectory = createToolkitDirectoryCache();
