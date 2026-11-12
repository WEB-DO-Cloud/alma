import type { AdapterContext, SecretStore } from "@rakazo/adapter-kit";
import { phoneCallSettings, resolveEncryptionKey, uploadSizeFromEnv } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { describe, expect, it } from "vitest";
import { ComposioConnector } from "./composio-connector.js";
import { FakeComposioClient } from "./composio-fake.js";
import { resolveDeploymentModel } from "./deployment-model.js";
import { deploymentGoogleClientId } from "./google-oauth.js";
import { readGooglePickerEnv, readGoogleScopeMode } from "./google-scope-mode.js";
import { GoogleWorkspaceConnector } from "./google-workspace.js";
import { mcpStdioOptionsFromEnv } from "./mcp-connector.js";
import { parseMcpOAuthPresetClients } from "./mcp-oauth-presets.js";
import {
  createConnectorRuntime,
  omitWorkspaceFromComposioCatalog,
  runRuntimeEnvFromProcess,
} from "./run-runtime.js";

// What the worker read inline before it shared the runtime builder with the API.
function previousWorkerValues(source: NodeJS.ProcessEnv) {
  const { key, configured } = resolveDeploymentModel(source);
  return {
    dataDir: source.DATA_DIR ?? "./data",
    encryptionKey: resolveEncryptionKey(source),
    composioApiKey: source.COMPOSIO_API_KEY,
    googleByoOauth: source.ALMA_GOOGLE_BYO_OAUTH === "true",
    composioIntegrations: source.ALMA_COMPOSIO_INTEGRATIONS === "true",
    googleOAuthClientId: deploymentGoogleClientId(source.ALMA_GOOGLE_OAUTH_CLIENT_ID) ?? undefined,
    googleScopeMode: readGoogleScopeMode(source),
    googlePicker: readGooglePickerEnv(source),
    webOrigin: source.WEB_ORIGIN?.trim() || undefined,
    cursorApiKey: source.CURSOR_API_KEY,
    deploymentModelKey: key,
    deploymentModelConfigured: configured,
    mcpStdioEnabled: source.MCP_STDIO_ENABLED === "true",
    mcpStdioAllowedCommands: (source.MCP_STDIO_ALLOWED_COMMANDS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    mcpStdio: mcpStdioOptionsFromEnv(source),
    mcpAllowPrivateEndpoint: source.MCP_ALLOW_PRIVATE_ENDPOINT === "true",
    mcpOAuthPresets: parseMcpOAuthPresetClients(source.MCP_OAUTH_PRESET_CLIENTS),
    pipedreamClientId: source.PIPEDREAM_CLIENT_ID,
    pipedreamClientSecret: source.PIPEDREAM_CLIENT_SECRET,
    pipedreamProjectId: source.PIPEDREAM_PROJECT_ID,
    pipedreamEnvironment: source.PIPEDREAM_ENVIRONMENT,
    ticketBoardEnabled: source.TICKET_BOARD_ENABLED === "true",
    ...phoneCallSettings(source),
    maxUploadSizeBytes: uploadSizeFromEnv(source),
    inboundEmailDomain: source.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase() || undefined,
  };
}

describe("runRuntimeEnvFromProcess", () => {
  it.each<NodeJS.ProcessEnv>([
    { NODE_ENV: "test" },
    {
      NODE_ENV: "test",
      DATA_DIR: "/var/rakazo",
      ENCRYPTION_KEY: "offline-encryption-key-at-least-32-chars",
      COMPOSIO_API_KEY: " composio-key ",
      CURSOR_API_KEY: " cursor-key ",
      PI_DEFAULT_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "openrouter-key",
      MCP_STDIO_ENABLED: "true",
      MCP_STDIO_ALLOWED_COMMANDS: " npx, uvx ,,",
      MCP_STDIO_IDLE_MS: "1000",
      MCP_ALLOW_PRIVATE_ENDPOINT: "true",
      PIPEDREAM_CLIENT_ID: " client ",
      PIPEDREAM_CLIENT_SECRET: "secret",
      PIPEDREAM_PROJECT_ID: "project",
      PIPEDREAM_ENVIRONMENT: "production",
      TICKET_BOARD_ENABLED: "true",
      PHONE_CALLS_ENABLED: "true",
      PHONE_CALL_RING_SECONDS: "30",
      MAX_UPLOAD_SIZE_MB: "20",
      INBOUND_EMAIL_DOMAIN: " Bots.Example.Test ",
    },
    { NODE_ENV: "test", INBOUND_EMAIL_DOMAIN: "  ", PIPEDREAM_ENVIRONMENT: "staging" },
    { NODE_ENV: "test", ALMA_GOOGLE_BYO_OAUTH: "yes" },
    { NODE_ENV: "test", ALMA_GOOGLE_BYO_OAUTH: "true" },
    { NODE_ENV: "test", ALMA_COMPOSIO_INTEGRATIONS: "yes" },
    { NODE_ENV: "test", ALMA_COMPOSIO_INTEGRATIONS: "true" },
  ])("reads the values the worker read before (%#)", (source) => {
    expect(runRuntimeEnvFromProcess(source)).toEqual(previousWorkerValues(source));
  });
});

const CLIENT_ID = "100-abc.apps.googleusercontent.com";

function googleSignInEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    WEB_ORIGIN: "https://app.alma.com.do",
    ALMA_GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    ALMA_GOOGLE_BYO_OAUTH: "true",
    MCP_OAUTH_PRESET_CLIENTS: JSON.stringify({
      "*.googleapis.com": { clientId: CLIENT_ID, clientSecret: "preset-secret-value" },
    }),
    ...extra,
  };
}

const runtimeDeps = {
  prisma: {} as PrismaClient,
  secrets: {} as SecretStore,
  events: {} as ThreadEvents,
};

const catalogContext: AdapterContext = {
  operationId: "op",
  traceId: "trace",
  spaceId: "space-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

describe("Composio integrations flag", () => {
  it("keeps ALMA's Google connector registered until the flag is exactly true", () => {
    const off = createConnectorRuntime(runRuntimeEnvFromProcess(googleSignInEnv()), runtimeDeps);
    expect(off.google).toBeInstanceOf(GoogleWorkspaceConnector);
    expect(off.stack.connector.managed("google")?.describe().id).toBe("google");
    expect(
      omitWorkspaceFromComposioCatalog(runRuntimeEnvFromProcess(googleSignInEnv()), true),
    ).toBe(true);

    const on = createConnectorRuntime(
      runRuntimeEnvFromProcess(googleSignInEnv({ ALMA_COMPOSIO_INTEGRATIONS: "true" })),
      runtimeDeps,
    );
    expect(on.google).toBeUndefined();
    expect(on.stack.connector.managed("google")).toBeUndefined();
    expect(
      omitWorkspaceFromComposioCatalog(
        runRuntimeEnvFromProcess(googleSignInEnv({ ALMA_COMPOSIO_INTEGRATIONS: "true" })),
        true,
      ),
    ).toBe(false);
    expect(
      omitWorkspaceFromComposioCatalog(
        runRuntimeEnvFromProcess(googleSignInEnv({ ALMA_COMPOSIO_INTEGRATIONS: "yes" })),
        true,
      ),
    ).toBe(true);
  });

  it("lists Gmail, Calendar, and Drive from Composio when the flag is on", async () => {
    const on = runRuntimeEnvFromProcess(googleSignInEnv({ ALMA_COMPOSIO_INTEGRATIONS: "true" }));
    const off = runRuntimeEnvFromProcess(googleSignInEnv());
    const shown = await new ComposioConnector({
      client: new FakeComposioClient(),
      omitWorkspaceCatalog: omitWorkspaceFromComposioCatalog(on, true),
    }).catalog(catalogContext);
    const hidden = await new ComposioConnector({
      client: new FakeComposioClient(),
      omitWorkspaceCatalog: omitWorkspaceFromComposioCatalog(off, true),
    }).catalog(catalogContext);
    expect(shown.map((item) => item.slug).sort()).toEqual([
      "GITHUB",
      "GMAIL",
      "GOOGLECALENDAR",
      "GOOGLEDRIVE",
      "NOTION",
      "SLACK",
    ]);
    expect(shown.every((item) => item.connectorId === "composio")).toBe(true);
    expect(hidden.map((item) => item.slug).sort()).toEqual(["GITHUB", "NOTION", "SLACK"]);
  });
});
