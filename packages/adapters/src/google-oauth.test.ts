import type { AdapterContext, SecretStore } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { ComposioConnector } from "./composio-connector.js";
import type { GoogleOAuthRemote, GoogleOAuthRow, GoogleOAuthStore } from "./google-oauth.js";
import {
  clientIdLast4,
  deploymentGoogleClientId,
  GoogleOAuthBadRequestError,
  GoogleOAuthForbiddenError,
  GoogleOAuthNotFoundError,
  GoogleOAuthService,
  isGoogleToolkit,
  isOrganizationAdminRole,
  splitScopes,
} from "./google-oauth.js";
import { authorizationAccepted, scopesFromToolkit } from "./google-oauth-remote.js";
import { EncryptedSecretStore } from "./secrets.js";

const CLIENT_ID = "100000000000-abc123def456.apps.googleusercontent.com";
const SECRET = "google-client-secret-value";
const ORG = "org-1";

function memoryStore(role = "owner"): GoogleOAuthStore & { rows: Map<string, GoogleOAuthRow> } {
  const rows = new Map<string, GoogleOAuthRow>();
  const locked = {
    read: async (organizationId: string) => rows.get(organizationId) ?? null,
    write: async (row: GoogleOAuthRow) => {
      rows.set(row.organizationId, row);
    },
    remove: async (organizationId: string) => {
      rows.delete(organizationId);
    },
  };
  return {
    rows,
    ...locked,
    organizationIdForSpace: async () => ORG,
    memberRole: async () => role,
    markedProviders: async () => [],
    withLock: async (_organizationId, fn) => fn(locked),
  };
}

function remote(overrides: Partial<GoogleOAuthRemote> = {}): GoogleOAuthRemote & {
  upserts: Array<{ clientSecret: string; slug: string }>;
  deleted: string[];
  tests: number;
} {
  const upserts: Array<{ clientSecret: string; slug: string }> = [];
  const deleted: string[] = [];
  const state = { tests: 0, next: 1 };
  const base: GoogleOAuthRemote = {
    googleToolkits: async () => [
      { slug: "GMAIL", name: "Gmail" },
      { slug: "GOOGLECALENDAR", name: "Calendar" },
    ],
    scopes: async (slug) =>
      slug === "GMAIL" ? ["https://www.googleapis.com/auth/gmail.readonly"] : [],
    upsert: async (input) => {
      upserts.push({ clientSecret: input.clientSecret, slug: input.slug });
      return {
        id: input.existingId ?? `ac_${state.next++}`,
        created: !input.existingId,
        slug: input.slug,
      };
    },
    deleteConfig: async (id) => {
      deleted.push(id);
      return "deleted";
    },
    restoreCredentials: async () => undefined,
    testGmail: async () => {
      state.tests += 1;
    },
  };
  return {
    ...base,
    ...overrides,
    upserts,
    deleted,
    get tests() {
      return state.tests;
    },
  };
}

function service(options: {
  enabled?: boolean;
  role?: string;
  store?: GoogleOAuthStore;
  remote?: GoogleOAuthRemote;
  secrets?: SecretStore;
  warn?: (message: string, fields: Record<string, string>) => void;
}) {
  const secrets = options.secrets ?? new EncryptedSecretStore("test-only-encryption-key");
  return new GoogleOAuthService({
    enabled: options.enabled ?? true,
    trustedClientId: "200000000000-deployedclient.apps.googleusercontent.com",
    store: options.store ?? memoryStore(options.role),
    remote: options.remote ?? remote(),
    secrets,
    callbackUrl: "https://alma.example.test/integrations/callback",
    warn: options.warn,
  });
}

const actor = { userId: "user-1", spaceId: "space-1" };

describe("Google client helpers", () => {
  it("recognizes Google toolkits and the client ID shape", () => {
    expect(isGoogleToolkit("Gmail")).toBe(true);
    expect(isGoogleToolkit("GOOGLEDRIVE")).toBe(true);
    expect(isGoogleToolkit("slack")).toBe(false);
    expect(deploymentGoogleClientId("  ")).toBeNull();
    expect(deploymentGoogleClientId("not-a-client")).toBeNull();
    expect(deploymentGoogleClientId(` ${CLIENT_ID} `)).toBe(CLIENT_ID);
    expect(clientIdLast4("100-AbCDef.apps.googleusercontent.com")).toBe("CDef");
    expect(isOrganizationAdminRole("member")).toBe(false);
    expect(isOrganizationAdminRole("admin, member")).toBe(true);
    expect(isOrganizationAdminRole("administrator")).toBe(false);
    expect(splitScopes(" a  b ")).toEqual(["a", "b"]);
    expect(splitScopes("")).toEqual([]);
    expect(
      scopesFromToolkit({
        authConfigDetails: [
          {
            mode: "OAUTH2",
            fields: { authConfigCreation: { optional: [{ name: "scopes", default: "one two" }] } },
          },
        ],
      }),
    ).toEqual(["one", "two"]);
    expect(
      authorizationAccepted(
        `https://accounts.example.test/o/oauth2?client_id=${CLIENT_ID}`,
        CLIENT_ID,
        SECRET,
      ),
    ).toBe(true);
    expect(
      authorizationAccepted(`https://accounts.example.test/o?x=${SECRET}`, CLIENT_ID, SECRET),
    ).toBe(false);
  });
});

describe("organization Google client", () => {
  it("encrypts the secret so the ciphertext does not contain it and only the organization id opens it", async () => {
    const secrets = new EncryptedSecretStore("test-only-encryption-key");
    const sealed = await secrets.put(
      SECRET,
      {
        operationId: "test",
        traceId: "test",
        spaceId: "space-1",
        userId: "user-1",
        signal: new AbortController().signal,
      },
      { recordId: ORG },
    );
    expect(sealed.ciphertext).not.toContain(SECRET);
    expect(await secrets.load(sealed.ciphertext, ORG)).toBe(SECRET);
    await expect(secrets.load(sealed.ciphertext, "other-org")).rejects.toThrow();
  });

  it("does not return the secret or the full client ID", async () => {
    const catalog = remote();
    const store = memoryStore();
    const warnings: string[] = [];
    const api = service({
      store,
      remote: catalog,
      warn: (message, fields) => warnings.push(JSON.stringify({ message, fields })),
    });
    const saved = await api.save(actor, {
      organizationId: ORG,
      clientId: CLIENT_ID,
      clientSecret: SECRET,
    });
    const body = JSON.stringify(saved);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain(CLIENT_ID);
    expect(body).not.toContain("secretCiphertext");
    expect(saved.clientIdLast4).toBe("f456");
    expect(saved.configured).toBe(true);
    expect(saved.trustedClientId).toBe("200000000000-deployedclient.apps.googleusercontent.com");
    expect(saved.apps.map((app) => app.slug)).toEqual(["GOOGLECALENDAR", "GMAIL"]);
    const stored = store.rows.get(ORG);
    expect(stored?.secretCiphertext).not.toContain(SECRET);
    expect(warnings.join("\n")).not.toContain(SECRET);
  });

  it("keeps today's sign-in when the flag is off or no client is saved", async () => {
    const catalog = remote();
    const off = service({ enabled: false, remote: catalog });
    await expect(off.get(actor)).rejects.toBeInstanceOf(GoogleOAuthNotFoundError);
    expect(await off.authConfigsForBegin(actor, "gmail")).toBeUndefined();
    expect(catalog.upserts).toHaveLength(0);

    const store = memoryStore();
    const on = service({ store, remote: catalog });
    expect(await on.authConfigsForBegin(actor, "slack")).toBeUndefined();
    expect(await on.authConfigsForBegin(actor, "gmail")).toBeUndefined();
    expect(catalog.upserts).toHaveLength(0);
    await on.save(actor, { organizationId: ORG, clientId: CLIENT_ID, clientSecret: SECRET });
    const ids = await on.authConfigsForBegin(actor, "gmail");
    expect(ids?.GMAIL).toMatch(/^ac_/);
    expect(ids).not.toHaveProperty("slack");
    await on.remove(actor, ORG);
    expect(await on.authConfigsForBegin(actor, "gmail")).toBeUndefined();
  });

  it("allows an owner or admin and refuses a member or guest", async () => {
    const owner = service({ role: "owner" });
    expect((await owner.get(actor)).configured).toBe(false);
    const admin = service({ role: "member, admin" });
    expect((await admin.get(actor)).redirectUris).toEqual([
      "https://backend.composio.dev/api/v3/toolkits/auth/callback",
    ]);
    for (const role of ["member", "guest", "administrator"]) {
      const api = service({ role });
      await expect(api.get(actor)).rejects.toBeInstanceOf(GoogleOAuthForbiddenError);
      await expect(
        api.save(actor, { organizationId: ORG, clientId: CLIENT_ID, clientSecret: SECRET }),
      ).rejects.toBeInstanceOf(GoogleOAuthForbiddenError);
      await expect(api.remove(actor, ORG)).rejects.toBeInstanceOf(GoogleOAuthForbiddenError);
      await expect(api.test(actor, ORG)).rejects.toBeInstanceOf(GoogleOAuthForbiddenError);
    }
    const mismatched = service({ role: "owner" });
    await expect(mismatched.remove(actor, "other-org")).rejects.toBeInstanceOf(
      GoogleOAuthForbiddenError,
    );
  });

  it("does not log the secret when the catalog fails", async () => {
    const warnings: string[] = [];
    const catalog = remote({
      upsert: async () => {
        throw new Error(`rejected ${SECRET} for ${CLIENT_ID}`);
      },
    });
    const api = service({
      remote: catalog,
      warn: (_message, fields) => warnings.push(JSON.stringify(fields)),
    });
    await expect(
      api.save(actor, { organizationId: ORG, clientId: CLIENT_ID, clientSecret: SECRET }),
    ).rejects.toThrow(GoogleOAuthBadRequestError);
    try {
      await api.save(actor, { organizationId: ORG, clientId: CLIENT_ID, clientSecret: SECRET });
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleOAuthBadRequestError);
      expect((error as Error).message).toBe("Could not save the Google client.");
      expect((error as Error).message).not.toContain(SECRET);
    }
    expect(warnings.join("\n")).not.toContain(SECRET);
    expect(warnings.join("\n")).not.toContain(CLIENT_ID);
  });

  it("passes auth config ids only when a connection start provides them", async () => {
    const created: Array<{ config: Record<string, unknown> }> = [];
    const client = {
      async create(_userId: string, config: Record<string, unknown>) {
        created.push({ config });
        return {
          sessionId: "session-1",
          authorize: async () => ({
            id: "request-1",
            redirectUrl: "https://accounts.example.test/auth",
          }),
          toolkits: async () => ({ items: [] }),
          tools: async () => [],
          execute: async () => ({ data: {}, error: null }),
        };
      },
      sessions: {
        use: async () => {
          throw new Error("no session");
        },
      },
      connectedAccounts: {
        list: async () => ({ items: [] }),
        waitForConnection: async () => {
          throw new Error("no account");
        },
        delete: async () => ({ success: true }),
      },
    };
    const connector = new ComposioConnector({ client: client as never });
    const context: AdapterContext = {
      operationId: "test",
      traceId: "test",
      spaceId: "space-1",
      userId: "user-1",
      signal: new AbortController().signal,
    };
    await connector.begin(
      { provider: "slack", redirectUrl: "https://alma.example.test/integrations/callback" },
      context,
    );
    expect(created[0]?.config).toEqual({ manageConnections: false, sandbox: { enable: false } });
    expect(created[0]?.config).not.toHaveProperty("authConfigs");
    await connector.begin(
      {
        provider: "gmail",
        redirectUrl: "https://alma.example.test/integrations/callback",
        authConfigIds: { GMAIL: "ac_1" },
      },
      context,
    );
    expect(created[1]?.config).toMatchObject({
      manageConnections: false,
      sandbox: { enable: false },
      authConfigs: { GMAIL: "ac_1" },
    });
  });

  it("fails a Google connection when the organization lookup throws", async () => {
    const store = memoryStore();
    store.organizationIdForSpace = async () => {
      throw new Error("database unavailable");
    };
    const api = service({ store });
    await expect(api.authConfigsForBegin(actor, "gmail")).rejects.toThrow(
      "Google sign-in settings could not be read.",
    );
  });
});
