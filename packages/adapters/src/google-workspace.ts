import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  AdapterContext,
  ConnectorCall,
  ConnectorCatalogItem,
  ConnectorEvent,
  ConnectorTool,
  ManagedConnectorProvider,
  SecretStore,
} from "@rakazo/adapter-kit";
import { matchFeaturedConnectorId } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { runAsTenant } from "@rakazo/db";
import { deploymentGoogleClientId } from "./google-oauth.js";
import type { McpOAuthPreset } from "./mcp-oauth-presets.js";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const RESPONSE_LIMIT = 1_000_000;
const REFRESH_WITHIN_MS = 60_000;

export const WORKSPACE_PREVIEW_MESSAGE = "This Google app connects from the card in the chat.";

const PREVIEW_HOSTS = new Set([
  "gmailmcp.googleapis.com",
  "calendarmcp.googleapis.com",
  "drivemcp.googleapis.com",
]);

const APPS = [
  {
    provider: "gmail",
    name: "Gmail",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
  },
  {
    provider: "googlecalendar",
    name: "Google Calendar",
    scopes: [
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  },
  {
    provider: "googledrive",
    name: "Google Drive",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  },
] as const;

type AppProvider = (typeof APPS)[number]["provider"];

const OMITTED_CATALOG = new Set(["gmail", "google-calendar", "google-drive"]);

type PendingSecret = { kind: "pending"; verifier: string; redirectUri: string };
type TokenSecret = {
  kind: "connected";
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type GoogleWorkspaceClient = {
  clientId: string;
  clientSecret: string;
  webOrigin: string;
};

/** The one preset secret for the deployment client, or null when sign-in cannot start. */
export function googleWorkspaceClient(input: {
  clientId: string | undefined;
  presets: readonly McpOAuthPreset[];
  webOrigin: string | undefined;
}): GoogleWorkspaceClient | null {
  const clientId = deploymentGoogleClientId(input.clientId);
  const origin = httpOrigin(input.webOrigin);
  if (!clientId || !origin) return null;
  const matches = input.presets.filter(
    (preset) => preset.clientId === clientId && Boolean(preset.clientSecret?.trim()),
  );
  if (matches.length !== 1) return null;
  return { clientId, clientSecret: matches[0]!.clientSecret!.trim(), webOrigin: origin };
}

/** True for the three Workspace Developer Preview MCP hosts. */
export function isWorkspacePreviewHost(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  try {
    return PREVIEW_HOSTS.has(new URL(endpoint).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Composio catalog rows this connector replaces. Connected Composio accounts are not touched. */
export function omitWorkspaceCatalogItem(slug: string, name: string): boolean {
  const id = matchFeaturedConnectorId(slug) ?? matchFeaturedConnectorId(name);
  return id !== null && OMITTED_CATALOG.has(id);
}

type ToolSpec = {
  name: string;
  provider: AppProvider;
  description: string;
  label: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
};

const STRING = { type: "string" } as const;
const TOOLS: ToolSpec[] = [
  {
    name: "gmail_list_labels",
    provider: "gmail",
    description: "List the labels on the connected Gmail account.",
    label: "Listing labels",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "gmail_search_threads",
    provider: "gmail",
    description: "Search Gmail threads. q uses Gmail search syntax.",
    label: "Searching mail",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { q: { ...STRING, maxLength: 500 } },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    name: "gmail_read_thread",
    provider: "gmail",
    description: "Read one Gmail thread by id.",
    label: "Reading a thread",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { id: { ...STRING, maxLength: 128 } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "gmail_create_draft",
    provider: "gmail",
    description: "Create a Gmail draft. This does not send it.",
    label: "Creating a draft",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        to: { ...STRING, maxLength: 320 },
        subject: { ...STRING, maxLength: 500 },
        body: { ...STRING, maxLength: 100_000 },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "gmail_send",
    provider: "gmail",
    description: "Send a plain-text Gmail message.",
    label: "Sending mail",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        to: { ...STRING, maxLength: 320 },
        body: { ...STRING, maxLength: 100_000 },
      },
      required: ["to", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "calendar_list_calendars",
    provider: "googlecalendar",
    description: "List calendars on the connected account.",
    label: "Listing calendars",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "calendar_list_events",
    provider: "googlecalendar",
    description: "List upcoming events on the primary calendar.",
    label: "Listing events",
    readOnly: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "calendar_create_event",
    provider: "googlecalendar",
    description: "Create an event on the primary calendar. start and end are ISO times.",
    label: "Creating an event",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        summary: { ...STRING, maxLength: 500 },
        start: { ...STRING, maxLength: 40 },
        end: { ...STRING, maxLength: 40 },
      },
      required: ["summary", "start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "drive_search_files",
    provider: "googledrive",
    description: "Search files in Google Drive. q uses Drive search syntax.",
    label: "Searching files",
    readOnly: true,
    inputSchema: {
      type: "object",
      properties: { q: { ...STRING, maxLength: 500 } },
      required: ["q"],
      additionalProperties: false,
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export class GoogleWorkspaceConnector implements ManagedConnectorProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: SecretStore,
    private readonly client: GoogleWorkspaceClient,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  describe() {
    return {
      id: "google",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: true, secretsBrokered: true },
    };
  }

  async catalog(context: AdapterContext): Promise<ConnectorCatalogItem[]> {
    const connected = new Set(await this.connectedProviders(context));
    return APPS.map((app) => ({
      connectorId: "google",
      slug: app.provider,
      name: app.name,
      logo: null,
      connected: connected.has(app.provider),
      noAuth: false,
    }));
  }

  async listConnectedExternalIds(context: AdapterContext): Promise<string[]> {
    return this.connectedProviders(context);
  }

  async listReconnectRefs(context: AdapterContext): Promise<string[]> {
    const rows = await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findMany({
        where: { spaceId: context.spaceId, userId: context.userId, status: "expired" },
        select: { id: true },
      }),
    );
    return rows.map((row) => row.id);
  }

  async connectionReady(context: AdapterContext, externalId: string): Promise<boolean> {
    const provider = appFor(externalId);
    if (!provider) return false;
    const connection = await this.inTenant(context, (db) =>
      db.connection.findFirst({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          connectorId: "google",
          provider,
          status: { in: ["pending", "connected"] },
        },
        orderBy: { updatedAt: "desc" },
        select: { providerRef: true },
      }),
    );
    const grantId = connection?.providerRef;
    if (!grantId || grantId === provider) return false;
    const grant = await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findFirst({
        where: {
          id: grantId,
          spaceId: context.spaceId,
          userId: context.userId,
          provider,
          status: "connected",
        },
        select: { id: true },
      }),
    );
    return Boolean(grant);
  }

  async begin(
    request: { provider: string; redirectUrl: string },
    context: AdapterContext,
  ): Promise<{ authorizationUrl: string | null; state: string }> {
    const provider = appFor(request.provider);
    if (!provider) throw new Error("Unknown Google app.");
    const app = APPS.find((entry) => entry.provider === provider)!;
    const id = randomUUID();
    const verifier = randomBytes(32).toString("base64url");
    const redirectUri = new URL("/mcp/oauth/callback", this.client.webOrigin).toString();
    const ciphertext = await this.seal({ kind: "pending", verifier, redirectUri }, id, context);
    await this.inTenant(context, async (db) => {
      await db.googleWorkspaceGrant.deleteMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          provider,
          status: { in: ["pending", "expired"] },
        },
      });
      await db.googleWorkspaceGrant.create({
        data: {
          id,
          spaceId: context.spaceId,
          userId: context.userId,
          provider,
          status: "pending",
          ciphertext,
        },
      });
    });
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: app.scopes.join(" "),
      state: id,
      access_type: "offline",
      prompt: "consent",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return { authorizationUrl: url.toString(), state: id };
  }

  async complete(
    request: { state: string; code?: string },
    context: AdapterContext,
  ): Promise<{ connectionRef: string }> {
    const done = await this.finishCallback({
      state: request.state,
      code: request.code ?? "",
      spaceId: context.spaceId,
      userId: context.userId,
      signal: context.signal,
    });
    if (!done) throw new Error("Could not sign in to Google.");
    return { connectionRef: request.state };
  }

  /** Exchange the callback code when this state is a grant for the signed-in user. */
  async finishCallback(input: {
    state: string;
    code: string;
    spaceId: string;
    userId: string;
    signal: AbortSignal;
  }): Promise<boolean> {
    const context = actorContext(input);
    const row = await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findFirst({
        where: { id: input.state, spaceId: input.spaceId, userId: input.userId },
      }),
    );
    if (!row) return false;
    if (row.status === "connected") return true;
    if (row.status !== "pending") return false;
    const pending = await this.open(row.ciphertext, row.id, context);
    if (pending.kind !== "pending") throw new Error("Could not sign in to Google.");
    const tokens = await this.tokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: this.client.clientId,
        client_secret: this.client.clientSecret,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.verifier,
      }),
      context.signal,
    );
    if (!tokens.refreshToken) {
      await this.inTenant(context, (db) =>
        db.googleWorkspaceGrant.deleteMany({
          where: { id: row.id, spaceId: input.spaceId, userId: input.userId, status: "pending" },
        }),
      );
      throw new Error("Google did not return a refresh token.");
    }
    await this.storeConnected(context, row, tokens.refreshToken, tokens);
    return true;
  }

  async cancelAuthorizationRequest(requestId: string, context: AdapterContext): Promise<void> {
    await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.deleteMany({
        where: {
          id: requestId,
          spaceId: context.spaceId,
          userId: context.userId,
          status: "pending",
        },
      }),
    );
  }

  async revoke(connectionRef: string, context: AdapterContext): Promise<void> {
    const rows = await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          ...(appFor(connectionRef) ? { provider: appFor(connectionRef)! } : { id: connectionRef }),
        },
      }),
    );
    for (const row of rows) {
      const secret = await this.open(row.ciphertext, row.id, context).catch(() => null);
      if (secret?.kind === "connected") {
        await this.fetchImpl(REVOKE_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: secret.refreshToken }),
          signal: context.signal,
          redirect: "error",
        }).catch(() => undefined);
      }
    }
    if (rows.length === 0) return;
    await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.deleteMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          id: { in: rows.map((row) => row.id) },
        },
      }),
    );
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    const connected = new Set(await this.connectedProviders(context));
    return TOOLS.filter((tool) => connected.has(tool.provider)).map((tool) => ({
      name: tool.name,
      description: tool.description,
      label: tool.label,
      readOnly: tool.readOnly,
      inputSchema: tool.inputSchema,
      route: { connectorId: "google", toolName: tool.name },
    }));
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    const name = call.route?.toolName ?? call.tool;
    const tool = TOOL_BY_NAME.get(name);
    if (!tool) {
      yield { type: "error", message: "Unknown Google tool." };
      return;
    }
    try {
      const data = await this.callTool(tool, call.args, context);
      yield { type: "result", data };
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : "Could not reach Google.",
      };
    }
  }

  private async callTool(
    tool: ToolSpec,
    args: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<unknown> {
    const grant = await this.newestConnected(context, tool.provider);
    if (!grant) throw new Error("Google needs to be connected again.");
    const secret = await this.freshToken(grant, context);
    const request = toolRequest(tool.name, args, this.now());
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${secret.accessToken}`,
        accept: "application/json",
        ...(request.body ? { "content-type": "application/json" } : {}),
      },
      ...(request.body ? { body: request.body } : {}),
      signal: context.signal,
      redirect: "error",
    });
    return readGoogleJson(response);
  }

  private async freshToken(
    grant: { id: string; ciphertext: string; provider: string },
    context: AdapterContext,
  ): Promise<TokenSecret> {
    const secret = await this.open(grant.ciphertext, grant.id, context);
    if (secret.kind !== "connected") throw new Error("Google needs to be connected again.");
    if (Date.parse(secret.expiresAt) - this.now().getTime() > REFRESH_WITHIN_MS) return secret;
    try {
      const tokens = await this.tokenRequest(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: secret.refreshToken,
          client_id: this.client.clientId,
          client_secret: this.client.clientSecret,
        }),
        context.signal,
      );
      const refreshToken = tokens.refreshToken || secret.refreshToken;
      await this.storeConnected(
        context,
        { id: grant.id, provider: grant.provider },
        refreshToken,
        { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt },
        false,
      );
      return {
        kind: "connected",
        accessToken: tokens.accessToken,
        refreshToken,
        expiresAt: tokens.expiresAt,
      };
    } catch {
      await this.inTenant(context, (db) =>
        db.googleWorkspaceGrant.updateMany({
          where: { id: grant.id, spaceId: context.spaceId, userId: context.userId },
          data: { status: "expired" },
        }),
      );
      throw new Error("Google needs to be connected again.");
    }
  }

  private async storeConnected(
    context: AdapterContext,
    grant: { id: string; provider: string },
    refreshToken: string,
    tokens: { accessToken: string; expiresAt: string },
    replaceOlder = true,
  ): Promise<void> {
    const ciphertext = await this.seal(
      {
        kind: "connected",
        accessToken: tokens.accessToken,
        refreshToken,
        expiresAt: tokens.expiresAt,
      },
      grant.id,
      context,
    );
    await this.inTenant(context, async (db) => {
      await db.googleWorkspaceGrant.update({
        where: { id: grant.id },
        data: { status: "connected", ciphertext },
      });
      if (!replaceOlder) return;
      const older = await db.googleWorkspaceGrant.findMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          provider: grant.provider,
          status: "connected",
          id: { not: grant.id },
        },
        select: { id: true },
      });
      if (older.length === 0) return;
      const ids = older.map((row) => row.id);
      await db.connection.updateMany({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          connectorId: "google",
          provider: grant.provider,
          providerRef: { in: ids },
          status: { in: ["connected", "pending", "error"] },
        },
        data: { status: "revoked" },
      });
      await db.googleWorkspaceGrant.deleteMany({
        where: { id: { in: ids }, spaceId: context.spaceId, userId: context.userId },
      });
    });
  }

  private async newestConnected(
    context: AdapterContext,
    provider: AppProvider,
  ): Promise<{ id: string; ciphertext: string; provider: string } | null> {
    return this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findFirst({
        where: {
          spaceId: context.spaceId,
          userId: context.userId,
          provider,
          status: "connected",
        },
        orderBy: { updatedAt: "desc" },
      }),
    );
  }

  private async connectedProviders(context: AdapterContext): Promise<AppProvider[]> {
    const rows = await this.inTenant(context, (db) =>
      db.googleWorkspaceGrant.findMany({
        where: { spaceId: context.spaceId, userId: context.userId, status: "connected" },
        select: { provider: true },
      }),
    );
    const found = new Set<AppProvider>();
    for (const row of rows) {
      const provider = appFor(row.provider);
      if (provider) found.add(provider);
    }
    return [...found];
  }

  private async tokenRequest(
    body: URLSearchParams,
    signal: AbortSignal,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Google returned ${response.status}.`);
    const payload = (await readGoogleJson(response)) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("Could not sign in to Google.");
    }
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
    return {
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : "",
      expiresAt: new Date(this.now().getTime() + expiresIn * 1000).toISOString(),
    };
  }

  private seal(value: PendingSecret | TokenSecret, recordId: string, context: AdapterContext) {
    return this.secrets
      .put(JSON.stringify(value), context, { recordId })
      .then((stored) => stored.ciphertext);
  }

  private async open(
    ciphertext: string,
    recordId: string,
    context: AdapterContext,
  ): Promise<PendingSecret | TokenSecret> {
    const text = await this.secrets.load(ciphertext, { recordId, signal: context.signal });
    const parsed = JSON.parse(text) as PendingSecret | TokenSecret;
    if (parsed.kind === "pending" || parsed.kind === "connected") return parsed;
    throw new Error("Could not sign in to Google.");
  }

  private inTenant<T>(context: AdapterContext, run: (db: PrismaClient) => Promise<T>): Promise<T> {
    return runAsTenant({ spaceId: context.spaceId, userId: context.userId }, () =>
      run(this.prisma),
    );
  }
}

function appFor(value: string): AppProvider | null {
  const key = value.trim().toLowerCase();
  return APPS.some((app) => app.provider === key) ? (key as AppProvider) : null;
}

function httpOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function actorContext(input: {
  spaceId: string;
  userId: string;
  signal: AbortSignal;
}): AdapterContext {
  return {
    operationId: "google-workspace",
    traceId: "google-workspace",
    spaceId: input.spaceId,
    userId: input.userId,
    signal: input.signal,
  };
}

function headerValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("That value cannot contain a new line.");
  return value;
}

function isoTime(value: unknown, name: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a time.`);
  }
  return new Date(value).toISOString();
}

function textArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

function rfc822(headers: Record<string, string>, body: string): string {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${headerValue(value)}`);
  lines.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", body);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function toolRequest(
  name: string,
  args: Record<string, unknown>,
  now: Date,
): { url: string; method: "GET" | "POST"; body?: string } {
  if (name === "gmail_list_labels") {
    return { url: "https://gmail.googleapis.com/gmail/v1/users/me/labels", method: "GET" };
  }
  if (name === "gmail_search_threads") {
    const q = textArg(args, "q");
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "10");
    return { url: url.toString(), method: "GET" };
  }
  if (name === "gmail_read_thread") {
    const id = textArg(args, "id");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("id is not a thread id.");
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`);
    url.searchParams.set("format", "full");
    return { url: url.toString(), method: "GET" };
  }
  if (name === "gmail_create_draft") {
    const raw = rfc822(
      { To: textArg(args, "to"), Subject: headerValue(textArg(args, "subject")) },
      textArg(args, "body"),
    );
    return {
      url: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      method: "POST",
      body: JSON.stringify({ message: { raw } }),
    };
  }
  if (name === "gmail_send") {
    const raw = rfc822({ To: textArg(args, "to"), Subject: "" }, textArg(args, "body"));
    return {
      url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      method: "POST",
      body: JSON.stringify({ raw }),
    };
  }
  if (name === "calendar_list_calendars") {
    return {
      url: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      method: "GET",
    };
  }
  if (name === "calendar_list_events") {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("maxResults", "10");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", now.toISOString());
    return { url: url.toString(), method: "GET" };
  }
  if (name === "calendar_create_event") {
    return {
      url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      method: "POST",
      body: JSON.stringify({
        summary: headerValue(textArg(args, "summary")),
        start: { dateTime: isoTime(args.start, "start") },
        end: { dateTime: isoTime(args.end, "end") },
      }),
    };
  }
  if (name === "drive_search_files") {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", textArg(args, "q"));
    url.searchParams.set("pageSize", "10");
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime)");
    return { url: url.toString(), method: "GET" };
  }
  throw new Error("Unknown Google tool.");
}

async function readGoogleJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > RESPONSE_LIMIT) {
        await reader.cancel().catch(() => undefined);
        throw new Error("The response was too large.");
      }
      chunks.push(step.value);
    }
  }
  const text = reader ? Buffer.concat(chunks).toString("utf8") : await response.text();
  if (!reader && text.length > RESPONSE_LIMIT) throw new Error("The response was too large.");
  if (!response.ok) throw new Error(`Google returned ${response.status}.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The response was not JSON.");
  }
}
