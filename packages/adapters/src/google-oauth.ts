import type { AdapterContext, SecretStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { advisoryLock } from "./advisory-lock.js";

/** Composio's OAuth callback. The admin registers this one URI on the Google client. */
export const GOOGLE_OAUTH_REDIRECT_URI =
  "https://backend.composio.dev/api/v3/toolkits/auth/callback";

/** Connection metadata set when that connection was started with the organization's client. */
export const ORGANIZATION_GOOGLE_CLIENT = "organizationGoogleClient";

const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const CLIENT_ID_SUFFIX = /\.apps\.googleusercontent\.com$/i;
const LOCK_MS = 60_000;

export class GoogleOAuthNotFoundError extends Error {
  constructor() {
    super("Not found.");
    this.name = "GoogleOAuthNotFoundError";
  }
}

export class GoogleOAuthForbiddenError extends Error {
  constructor() {
    super("Forbidden.");
    this.name = "GoogleOAuthForbiddenError";
  }
}

export class GoogleOAuthBadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthBadRequestError";
  }
}

export type GoogleOAuthView = {
  configured: boolean;
  clientIdLast4: string | null;
  redirectUris: string[];
  apps: Array<{ slug: string; name: string; scopes: string[] }>;
  scopesUnavailable: boolean;
  trustedClientId: string | null;
};

export type GoogleOAuthActor = { userId: string; spaceId: string };

export type GoogleOAuthRow = {
  organizationId: string;
  clientId: string;
  secretCiphertext: string;
  remoteAuthConfigIds: Record<string, string>;
  updatedByUserId: string;
};

export type GoogleOAuthLockedStore = {
  read(organizationId: string): Promise<GoogleOAuthRow | null>;
  write(row: GoogleOAuthRow): Promise<void>;
  remove(organizationId: string): Promise<void>;
};

export type GoogleOAuthStore = GoogleOAuthLockedStore & {
  organizationIdForSpace(spaceId: string): Promise<string | null>;
  memberRole(organizationId: string, userId: string): Promise<string | null>;
  markedProviders(spaceId: string, userId: string): Promise<string[]>;
  withLock<T>(
    organizationId: string,
    fn: (locked: GoogleOAuthLockedStore) => Promise<T>,
  ): Promise<T>;
};

export type GoogleToolkit = { slug: string; name: string };

export type GoogleOAuthRemote = {
  googleToolkits(): Promise<GoogleToolkit[]>;
  scopes(slug: string): Promise<string[]>;
  upsert(input: {
    organizationId: string;
    slug: string;
    clientId: string;
    clientSecret: string;
    existingId?: string;
  }): Promise<{ id: string; created: boolean; slug: string }>;
  deleteConfig(id: string): Promise<"deleted" | "missing">;
  restoreCredentials(id: string, clientId: string, clientSecret: string): Promise<void>;
  testGmail(input: {
    userId: string;
    slug: string;
    authConfigId: string;
    callbackUrl: string;
    clientId: string;
    clientSecret: string;
  }): Promise<void>;
};

type Warn = (message: string, fields: Record<string, string>) => void;

/** A Google toolkit is `gmail` or a slug that starts with `google`, ignoring case. */
export function isGoogleToolkit(slug: string): boolean {
  const key = slug.trim().toLowerCase();
  return key === "gmail" || key.startsWith("google");
}

export function isGoogleClientId(value: string): boolean {
  return CLIENT_ID_PATTERN.test(value.trim());
}

/** The deployment's own client ID, or null when the variable is unset or not a Google client ID. */
export function deploymentGoogleClientId(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && isGoogleClientId(trimmed) ? trimmed : null;
}

/** Last four characters of the client ID with the Google suffix removed. */
export function clientIdLast4(clientId: string): string {
  return clientId.trim().replace(CLIENT_ID_SUFFIX, "").slice(-4);
}

export function splitScopes(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value.trim().split(/\s+/);
}

/** True when a comma-separated membership role contains owner or admin. */
export function isOrganizationAdminRole(role: string): boolean {
  return role
    .split(",")
    .map((token) => token.trim())
    .some((token) => token === "owner" || token === "admin");
}

export function googleAuthConfigName(organizationId: string, slug: string): string {
  return `alma-google-${organizationId}-${slug}`;
}

export function redactGoogleOAuth(text: string, secret: string, clientId: string): string {
  let out = text;
  if (secret) out = out.split(secret).join("[redacted]");
  if (clientId) out = out.split(clientId).join("[redacted]");
  return out;
}

export function findStoredAuthConfig(
  map: Record<string, string>,
  slug: string,
): { key: string; id: string } | undefined {
  const wanted = slug.trim().toLowerCase();
  for (const [key, id] of Object.entries(map)) {
    if (key.toLowerCase() === wanted && id) return { key, id };
  }
  return undefined;
}

function googleIds(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([slug]) => isGoogleToolkit(slug)));
}

function validateClient(clientId: string, clientSecret: string): { clientId: string } {
  const id = clientId.trim();
  if (!isGoogleClientId(id) || id.length > 200) {
    throw new GoogleOAuthBadRequestError("Enter a Google client ID.");
  }
  if (
    clientSecret.length < 8 ||
    clientSecret.length > 256 ||
    /\s/.test(clientSecret) ||
    clientSecret === id
  ) {
    throw new GoogleOAuthBadRequestError("Enter the client secret from Google Cloud.");
  }
  return { clientId: id };
}

function emptyView(trustedClientId: string | null, scopesUnavailable: boolean): GoogleOAuthView {
  return {
    configured: false,
    clientIdLast4: null,
    redirectUris: [GOOGLE_OAUTH_REDIRECT_URI],
    apps: [],
    scopesUnavailable,
    trustedClientId,
  };
}

function viewFrom(
  row: GoogleOAuthRow | null,
  apps: GoogleOAuthView["apps"],
  scopesUnavailable: boolean,
  trustedClientId: string | null,
): GoogleOAuthView {
  if (!row) return { ...emptyView(trustedClientId, scopesUnavailable), apps };
  return {
    configured: true,
    clientIdLast4: clientIdLast4(row.clientId),
    redirectUris: [GOOGLE_OAUTH_REDIRECT_URI],
    apps,
    scopesUnavailable,
    trustedClientId,
  };
}

function contextFor(actor: GoogleOAuthActor, operationId: string): AdapterContext {
  return {
    operationId,
    traceId: operationId,
    spaceId: actor.spaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  };
}

function detailOf(error: unknown, secret: string, clientId: string): string {
  const text = error instanceof Error ? error.message : "Google sign-in failed.";
  return redactGoogleOAuth(text, secret, clientId).slice(0, 300);
}

/** Tool-run auth config ids. Does not create configs and does not decrypt the secret. */
export function googleRunAuthConfigs(
  prisma: PrismaClient,
  secrets: SecretStore,
  context: AdapterContext,
  toolkits: string[],
): Promise<Record<string, string> | undefined> {
  const unused = async () => {
    throw new Error("unused");
  };
  return new GoogleOAuthService({
    enabled: true,
    trustedClientId: null,
    store: createGoogleOAuthStore(prisma),
    remote: {
      googleToolkits: async () => [],
      scopes: async () => [],
      upsert: unused,
      deleteConfig: unused as GoogleOAuthRemote["deleteConfig"],
      restoreCredentials: unused as GoogleOAuthRemote["restoreCredentials"],
      testGmail: unused as GoogleOAuthRemote["testGmail"],
    },
    secrets,
    callbackUrl: "",
  }).authConfigsForRun(context, toolkits);
}

export function createGoogleOAuthStore(prisma: PrismaClient): GoogleOAuthStore {
  const bound = (db: PrismaClient): GoogleOAuthLockedStore => ({
    async read(organizationId) {
      const row = await db.organizationGoogleOAuthClient.findUnique({
        where: { organizationId },
      });
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        clientId: row.clientId,
        secretCiphertext: row.secretCiphertext,
        remoteAuthConfigIds: idMap(row.remoteAuthConfigIds),
        updatedByUserId: row.updatedByUserId,
      };
    },
    async write(row) {
      await db.organizationGoogleOAuthClient.upsert({
        where: { organizationId: row.organizationId },
        create: {
          organizationId: row.organizationId,
          clientId: row.clientId,
          secretCiphertext: row.secretCiphertext,
          remoteAuthConfigIds: row.remoteAuthConfigIds,
          updatedByUserId: row.updatedByUserId,
        },
        update: {
          clientId: row.clientId,
          secretCiphertext: row.secretCiphertext,
          remoteAuthConfigIds: row.remoteAuthConfigIds,
          updatedByUserId: row.updatedByUserId,
        },
      });
    },
    async remove(organizationId) {
      await db.organizationGoogleOAuthClient.deleteMany({ where: { organizationId } });
    },
  });

  return {
    ...bound(prisma),
    async organizationIdForSpace(spaceId) {
      const space = await prisma.space.findUnique({
        where: { id: spaceId },
        select: { organizationId: true },
      });
      return space?.organizationId ?? null;
    },
    async memberRole(organizationId, userId) {
      const member = await prisma.member.findFirst({
        where: { organizationId, userId },
        select: { role: true },
      });
      return member?.role ?? null;
    },
    async markedProviders(spaceId, userId) {
      const rows = await prisma.connection.findMany({
        where: { spaceId, userId, connectorId: "composio" },
        select: { provider: true, metadata: true },
      });
      return rows
        .filter((row) => {
          const metadata = row.metadata;
          return (
            Boolean(metadata) &&
            typeof metadata === "object" &&
            !Array.isArray(metadata) &&
            (metadata as Record<string, unknown>)[ORGANIZATION_GOOGLE_CLIENT] === true
          );
        })
        .map((row) => row.provider);
    },
    withLock(organizationId, fn) {
      return prisma.$transaction(
        async (tx) => {
          await advisoryLock(tx, "google-oauth", organizationId);
          return fn(bound(tx as unknown as PrismaClient));
        },
        { timeout: LOCK_MS, maxWait: 10_000 },
      );
    },
  };
}

function idMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, id] of Object.entries(value)) {
    if (typeof id === "string" && id) out[key] = id;
  }
  return out;
}

/**
 * Organization Google client: encrypt the secret, talk to the catalog, and keep the
 * current sign-in when the flag is off or no client is saved.
 */
export class GoogleOAuthService {
  private readonly warn: Warn;

  constructor(
    private readonly options: {
      enabled: boolean;
      trustedClientId: string | null;
      store: GoogleOAuthStore;
      remote: GoogleOAuthRemote;
      secrets: SecretStore;
      callbackUrl: string;
      warn?: Warn;
    },
  ) {
    this.warn = options.warn ?? ((message, fields) => getLogger().warn(message, fields));
  }

  async get(actor: GoogleOAuthActor): Promise<GoogleOAuthView> {
    this.assertEnabled();
    const organizationId = await this.organizationId(actor);
    await this.assertAdmin(organizationId, actor.userId);
    const row = await this.readRow(organizationId);
    const listed = await this.listApps();
    return viewFrom(row, listed.apps, listed.scopesUnavailable, this.options.trustedClientId);
  }

  async save(
    actor: GoogleOAuthActor,
    input: { organizationId: string; clientId: string; clientSecret: string },
  ): Promise<GoogleOAuthView> {
    this.assertEnabled();
    const { clientId } = validateClient(input.clientId, input.clientSecret);
    const organizationId = await this.organizationId(actor);
    if (input.organizationId !== organizationId) throw new GoogleOAuthForbiddenError();
    await this.assertAdmin(organizationId, actor.userId);
    const toolkits = await this.toolkitsOrFail(input.clientSecret, clientId);
    await this.options.store.withLock(organizationId, async (locked) => {
      await this.assertAdmin(organizationId, actor.userId);
      const previous = await locked.read(organizationId);
      const previousSecret = previous
        ? await this.options.secrets.load(previous.secretCiphertext, organizationId)
        : "";
      const previousMap = previous?.remoteAuthConfigIds ?? {};
      const nextMap: Record<string, string> = { ...previousMap };
      const changed: Array<{ id: string; created: boolean }> = [];
      try {
        for (const toolkit of toolkits) {
          const existing = findStoredAuthConfig(previousMap, toolkit.slug);
          const saved = await this.options.remote.upsert({
            organizationId,
            slug: existing?.key ?? toolkit.slug,
            clientId,
            clientSecret: input.clientSecret,
            existingId: existing?.id,
          });
          changed.push(saved);
          nextMap[existing?.key ?? saved.slug] = saved.id;
        }
        const sealed = await this.options.secrets.put(
          input.clientSecret,
          contextFor(actor, "googleOAuth.save"),
          { recordId: organizationId },
        );
        await locked.write({
          organizationId,
          clientId,
          secretCiphertext: sealed.ciphertext,
          remoteAuthConfigIds: nextMap,
          updatedByUserId: actor.userId,
        });
      } catch (error) {
        await this.revert(changed, previous, previousSecret, previousMap);
        this.warn("google oauth save failed", {
          organizationId,
          detail: detailOf(error, input.clientSecret, clientId),
        });
        throw new GoogleOAuthBadRequestError("Could not save the Google client.");
      }
    });
    const listed = await this.listApps();
    const row = await this.readRow(organizationId);
    return viewFrom(row, listed.apps, listed.scopesUnavailable, this.options.trustedClientId);
  }

  async remove(actor: GoogleOAuthActor, organizationId: string): Promise<GoogleOAuthView> {
    this.assertEnabled();
    const active = await this.organizationId(actor);
    if (organizationId !== active) throw new GoogleOAuthForbiddenError();
    await this.assertAdmin(active, actor.userId);
    const failure = await this.options.store.withLock(active, async (locked) => {
      await this.assertAdmin(active, actor.userId);
      const row = await locked.read(active);
      if (!row) return null;
      const secret = await this.options.secrets.load(row.secretCiphertext, active);
      const gone = new Set<string>();
      try {
        for (const [slug, id] of Object.entries(row.remoteAuthConfigIds)) {
          await this.options.remote.deleteConfig(id);
          gone.add(slug);
        }
      } catch (error) {
        const remaining = Object.fromEntries(
          Object.entries(row.remoteAuthConfigIds).filter(([slug]) => !gone.has(slug)),
        );
        await locked.write({ ...row, remoteAuthConfigIds: remaining });
        return { secret, clientId: row.clientId, error };
      }
      await locked.remove(active);
      return null;
    });
    if (failure) {
      this.warn("google oauth remove failed", {
        organizationId: active,
        detail: detailOf(failure.error, failure.secret, failure.clientId),
      });
      throw new GoogleOAuthBadRequestError("Could not remove the Google client.");
    }
    const listed = await this.listApps();
    return viewFrom(null, listed.apps, listed.scopesUnavailable, this.options.trustedClientId);
  }

  async test(actor: GoogleOAuthActor, organizationId: string): Promise<{ ok: true }> {
    this.assertEnabled();
    const active = await this.organizationId(actor);
    if (organizationId !== active) throw new GoogleOAuthForbiddenError();
    await this.assertAdmin(active, actor.userId);
    await this.options.store.withLock(active, async (locked) => {
      await this.assertAdmin(active, actor.userId);
      const row = await locked.read(active);
      if (!row) throw new GoogleOAuthBadRequestError("Save a client first.");
      const secret = await this.options.secrets.load(row.secretCiphertext, active);
      const existing = findStoredAuthConfig(row.remoteAuthConfigIds, "gmail");
      const slug = existing?.key ?? "gmail";
      let authConfigId = existing?.id;
      try {
        if (!authConfigId) {
          const saved = await this.options.remote.upsert({
            organizationId: active,
            slug,
            clientId: row.clientId,
            clientSecret: secret,
          });
          authConfigId = saved.id;
          await locked.write({
            ...row,
            remoteAuthConfigIds: { ...row.remoteAuthConfigIds, [saved.slug]: saved.id },
          });
        }
        await this.options.remote.testGmail({
          userId: actor.userId,
          slug,
          authConfigId,
          callbackUrl: this.options.callbackUrl,
          clientId: row.clientId,
          clientSecret: secret,
        });
      } catch (error) {
        if (error instanceof GoogleOAuthBadRequestError) throw error;
        this.warn("google oauth test failed", {
          organizationId: active,
          detail: detailOf(error, secret, row.clientId),
        });
        throw new GoogleOAuthBadRequestError("The test connection failed.");
      }
    });
    return { ok: true };
  }

  /**
   * Auth config ids for a Google connection start. Undefined keeps today's session.
   * A database error throws and must not fall through to the current sign-in.
   */
  async authConfigsForBegin(
    actor: GoogleOAuthActor,
    provider: string,
  ): Promise<Record<string, string> | undefined> {
    if (!this.options.enabled || !isGoogleToolkit(provider)) return undefined;
    const organizationId = await this.organizationId(actor);
    return this.options.store.withLock(organizationId, async (locked) => {
      const row = await this.readLocked(locked, organizationId);
      if (!row) return undefined;
      const secret = await this.options.secrets.load(row.secretCiphertext, organizationId);
      const existing = findStoredAuthConfig(row.remoteAuthConfigIds, provider);
      if (existing) {
        const ids = googleIds(row.remoteAuthConfigIds);
        return Object.keys(ids).length > 0 ? ids : undefined;
      }
      try {
        const saved = await this.options.remote.upsert({
          organizationId,
          slug: provider.trim(),
          clientId: row.clientId,
          clientSecret: secret,
        });
        const next = { ...row.remoteAuthConfigIds, [saved.slug]: saved.id };
        await locked.write({ ...row, remoteAuthConfigIds: next });
        const ids = googleIds(next);
        return Object.keys(ids).length > 0 ? ids : undefined;
      } catch (error) {
        this.warn("google oauth connect failed", {
          organizationId,
          detail: detailOf(error, secret, row.clientId),
        });
        throw new GoogleOAuthBadRequestError("Could not start the Google connection.");
      }
    });
  }

  /** Ids for tool runs of connections that were started with the organization's client. */
  async authConfigsForRun(
    context: AdapterContext,
    toolkits: string[],
  ): Promise<Record<string, string> | undefined> {
    if (!this.options.enabled || !toolkits.some(isGoogleToolkit)) return undefined;
    let organizationId: string | null;
    try {
      organizationId = await this.options.store.organizationIdForSpace(context.spaceId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
    if (!organizationId) return undefined;
    const row = await this.readRow(organizationId);
    if (!row) return undefined;
    let marked: string[];
    try {
      marked = await this.options.store.markedProviders(context.spaceId, context.userId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
    const markedKeys = new Set(marked.map((provider) => provider.trim().toLowerCase()));
    const ids: Record<string, string> = {};
    for (const toolkit of toolkits) {
      if (!isGoogleToolkit(toolkit) || !markedKeys.has(toolkit.trim().toLowerCase())) continue;
      const stored = findStoredAuthConfig(row.remoteAuthConfigIds, toolkit);
      if (stored) ids[stored.key] = stored.id;
    }
    return Object.keys(ids).length > 0 ? ids : undefined;
  }

  private assertEnabled(): void {
    if (!this.options.enabled) throw new GoogleOAuthNotFoundError();
  }

  private async organizationId(actor: GoogleOAuthActor): Promise<string> {
    let organizationId: string | null;
    try {
      organizationId = await this.options.store.organizationIdForSpace(actor.spaceId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
    if (!organizationId) throw new GoogleOAuthForbiddenError();
    return organizationId;
  }

  private async assertAdmin(organizationId: string, userId: string): Promise<void> {
    let role: string | null;
    try {
      role = await this.options.store.memberRole(organizationId, userId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
    if (!role || !isOrganizationAdminRole(role)) throw new GoogleOAuthForbiddenError();
  }

  private async readRow(organizationId: string): Promise<GoogleOAuthRow | null> {
    try {
      return await this.options.store.read(organizationId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
  }

  private async readLocked(
    locked: GoogleOAuthLockedStore,
    organizationId: string,
  ): Promise<GoogleOAuthRow | null> {
    try {
      return await locked.read(organizationId);
    } catch {
      throw new GoogleOAuthBadRequestError("Google sign-in settings could not be read.");
    }
  }

  private async listApps(): Promise<{
    apps: GoogleOAuthView["apps"];
    scopesUnavailable: boolean;
  }> {
    try {
      const toolkits = await this.options.remote.googleToolkits();
      const apps = [];
      for (const toolkit of toolkits) {
        apps.push({ ...toolkit, scopes: await this.options.remote.scopes(toolkit.slug) });
      }
      apps.sort((left, right) => left.name.localeCompare(right.name));
      return { apps, scopesUnavailable: false };
    } catch (error) {
      this.warn("google oauth directory failed", { detail: detailOf(error, "", "") });
      return { apps: [], scopesUnavailable: true };
    }
  }

  private async toolkitsOrFail(secret: string, clientId: string): Promise<GoogleToolkit[]> {
    try {
      return await this.options.remote.googleToolkits();
    } catch (error) {
      this.warn("google oauth directory failed", {
        detail: detailOf(error, secret, clientId),
      });
      throw new GoogleOAuthBadRequestError("The Google app list could not be loaded.");
    }
  }

  private async revert(
    changed: Array<{ id: string; created: boolean }>,
    previous: GoogleOAuthRow | null,
    previousSecret: string,
    previousMap: Record<string, string>,
  ): Promise<void> {
    for (const item of changed) {
      try {
        if (item.created || !previous) {
          await this.options.remote.deleteConfig(item.id);
          continue;
        }
        const stillThere = Object.values(previousMap).includes(item.id);
        if (!stillThere) {
          await this.options.remote.deleteConfig(item.id);
          continue;
        }
        await this.options.remote.restoreCredentials(item.id, previous.clientId, previousSecret);
      } catch (error) {
        this.warn("google oauth revert failed", {
          authConfigId: item.id,
          detail: detailOf(error, previousSecret, previous?.clientId ?? ""),
        });
      }
    }
  }
}
